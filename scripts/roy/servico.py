"""Serviço do Roy em segundo plano (LaunchAgent com.infoprohub.roy, ver
scripts/roy/instalar.sh). O Davi não precisa abrir chat nenhum:

  - Pediu ajuste na tela de revisão (status 'ajuste') → o Roy pega o pedido.
    Excluir página e texto editado na tela: só remonta. Pedido escrito
    ("troca a capa", "título mais curto"): chama o Claude em segundo plano
    (`claude -p`, mesmo login do ouvinte do Jarvis) pra mexer no conteúdo,
    e depois remonta. Volta pra 'revisar' com a versão nova.
  - "Aprovar" com páginas excluídas/texto editado (aprovar_apos_ajuste): remonta
    e, passando na revisão automática, já aprova e cria a tarefa da Dalila.
  - Se a revisão automática barrar, fica 'erro' (vermelho no mapa) com o motivo.
  - Atividade na fila do Roy (o Davi passa pelo Infopro): o Claude escolhe o
    reel, transcreve e escreve o conteúdo; o serviço monta e manda pra revisão.
    A tarefa fica 'aguardando_aprovacao' e conclui quando o Davi aprovar.

Não publica nada no Instagram. Log em ~/.infopro-hub/roy/servico.log.

    python3 scripts/roy/servico.py           # roda (o LaunchAgent faz isso)
    python3 scripts/roy/servico.py --uma-vez # processa o que houver e sai
"""
import importlib.util
import json
import re
import sys
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(AQUI))
import roy  # noqa: E402
import render  # noqa: E402

LOG = render.BASE / "servico.log"
# Linhas que a tela de revisão escreve sozinha (carrossel.ts → montarPedidoAjuste).
AUTOMATICAS = re.compile(r"^(Excluir (a página|as páginas) .*|Textos editados na tela: .*|Legenda editada na tela\.)$")


def log(*partes):
    linha = f"[{datetime.now():%d/%m %H:%M:%S}] " + " ".join(str(p) for p in partes)
    with open(LOG, "a") as f:
        f.write(linha + "\n")
    print(linha, flush=True)


def _ouvinte():
    """Reaproveita o jeito do ouvinte do Jarvis de chamar o Claude."""
    spec = importlib.util.spec_from_file_location("jarvis_ouvinte", RAIZ / "scripts" / "jarvis-ouvinte.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def pedido_escrito(feedback):
    return "\n".join(l for l in (feedback or "").splitlines() if l.strip() and not AUTOMATICAS.match(l.strip())).strip()


PROMPT = """Você é o Roy, o criador de carrosséis do @eu.davioficial (projeto Infopro Hub). Está rodando em segundo plano: o Davi não vê este terminal.

Leia primeiro docs/agentes/roy-carrossel.md (manual e Parte E, principalmente as regras do conteúdo e das capas reais) e os seus aprendizados com o Davi: `python3 scripts/inteligencia/ler.py --cliente {cliente} --agente roy` (os "SIGA SEMPRE" do topo valem sempre).

O Davi revisou o carrossel "{tema}" no Infopro e pediu:
---
{pedido}
---

A pasta do carrossel é {pasta}. Lá estão conteudo.json (o que vira as páginas; as mudanças que ele fez na tela já foram aplicadas), transcricao.txt (a fala do reel) e fonte.json.

Faça o ajuste pedido editando SÓ o {pasta}/conteudo.json (formato em scripts/roy/render.py).
- Se precisar de pôster/capa real de filme ou livro: scripts/roy/capas.py (olhe a imagem baixada antes de usar).
- Se precisar de escultura ou ícone novo: scripts/roy/ilustracoes.py (custa dinheiro: só se o pedido exigir).
- Para conferir o visual, pode rodar `python3 scripts/roy/render.py {pasta}` e olhar os PNGs; NÃO rode roy.py renderizar (o serviço faz isso depois).
- Mantenha as regras do manual: 6 a 8 páginas, última página com chamada para ação, pouco texto, sem inventar informação.
- REGRA DO DAVI (15/10/2026): mude o MÍNIMO em relação ao reel. A página 1 é a headline do reel, com as palavras que ele falou (pode ser longa; só ajuste se não couber). As outras páginas seguem as ideias e as frases do vídeo, na ordem dele; corte, mas não reescreva com palavras suas. Se achar que outro título funcionaria melhor (ex.: mais curto), NÃO troque: ponha em "opcoes": ["...", "..."] naquela página (2 ou 3), que o Davi escolhe na revisão.
- Não publique nada no Instagram.

- APRENDA com o pedido: se ele mostrar como o Davi gosta (ou não gosta) das coisas e valer para os próximos carrosséis, anote em 1 frase curta e geral:
  python3 scripts/inteligencia/aprender.py anotar --cliente {cliente} --agente roy "<a regra>"

No fim, responda em 1 ou 2 frases simples, em português, o que você mudou (vai aparecer pro Davi)."""


def atender():
    linhas = roy.db("SELECT id, tema, feedback, aprovar_apos_ajuste FROM public.carrosseis WHERE cliente_id = %s "
                    "AND status = 'ajuste' ORDER BY atualizado_em LIMIT 1", (roy.CLIENTE,))
    if not linhas:
        return False
    id_, tema, feedback, ja_aprovado = linhas[0]
    id_ = str(id_)
    # Pega pra si (se dois rodarem, só um consegue).
    if not roy.db("UPDATE public.carrosseis SET status = 'produzindo', mensagem = 'Roy recebeu seu pedido…', "
                  "atualizado_em = now() WHERE id = %s AND status = 'ajuste' RETURNING id", (id_,)):
        return True
    log("ajuste:", tema, "|", (feedback or "").replace("\n", " / ")[:200])
    pasta = roy.TRABALHO / id_
    try:
        if not (pasta / "conteudo.json").exists():
            raise RuntimeError("a pasta de trabalho do carrossel não está neste Mac")
        roy.ajustes(so_id=id_)  # textos/legenda/páginas excluídas da tela → conteudo.json
        escrito = pedido_escrito(feedback)
        resumo = None
        if escrito:
            roy.db("UPDATE public.carrosseis SET mensagem = %s, atualizado_em = now() WHERE id = %s",
                   (f"Roy está ajustando: {escrito[:120]}", id_))
            antes = (pasta / "conteudo.json").read_text()
            ok, resumo = _ouvinte().rodar_claude(PROMPT.format(tema=tema, pedido=escrito, pasta=pasta, cliente=roy.CLIENTE), minutos=25)
            if not ok:
                raise RuntimeError(f"o Claude não conseguiu ajustar: {resumo}")
            json.loads((pasta / "conteudo.json").read_text())  # continua um JSON válido?
            if (pasta / "conteudo.json").read_text() == antes:
                log("aviso: o Claude não mudou o conteudo.json")
            log("claude:", (resumo or "")[:300])
        roy.db("UPDATE public.carrosseis SET mensagem = 'Montando a nova versão…', atualizado_em = now() WHERE id = %s", (id_,))
        if roy.renderizar(id_, nova_versao=True):
            if ja_aprovado and not escrito:  # o Davi já aprovou: não volta pra revisão
                quem = roy.aprovar(id_)
                log("aprovado direto:", tema, "→", quem)
                return True
            if resumo:
                roy.db("UPDATE public.carrosseis SET mensagem = %s WHERE id = %s", (f"Roy: {resumo[:300]}", id_))
            log("ok:", tema)
        else:
            log("revisão automática barrou:", tema)
    except Exception as e:
        log("erro:", tema, traceback.format_exc()[-600:])
        roy.db("UPDATE public.carrosseis SET status = 'erro', aprovar_apos_ajuste = false, mensagem = %s, "
               "atualizado_em = now() WHERE id = %s", (f"Roy não conseguiu ajustar: {str(e)[:250]}", id_))
    return True


# ---------------------------------------------------------------- tarefas do Roy

PROMPT_TAREFA = """Você é o Roy, o criador de carrosséis do @eu.davioficial (projeto Infopro Hub). Está rodando em segundo plano: o Davi não vê este terminal.

Leia primeiro docs/agentes/roy-carrossel.md inteiro (manual, Parte E e regras das capas reais) e os seus aprendizados com o Davi: `python3 scripts/inteligencia/ler.py --cliente {cliente} --agente roy` (os "SIGA SEMPRE" do topo valem sempre).

O Davi te passou esta tarefa no Infopro:
---
{titulo}
{descricao}
---

Faça o carrossel (ou os carrosséis, se a tarefa pedir mais de um), assim:
1. `python3 scripts/roy/roy.py candidatos 15`: reels ainda não usados, do mais novo para o mais antigo. Se a tarefa citar um reel ou tema, use esse. Senão, pegue o mais novo elegível. Confira também o TEMA: não repita assunto de carrossel que já existe (veja os nomes das pastas em "~/Library/CloudStorage/GoogleDrive-metafocando@gmail.com/Meu Drive/Projeto 100k/Eu.davi/Carrossel /", que tem um espaço no fim). Pule vídeo sem fala útil.
2. `python3 scripts/roy/roy.py iniciar <media_id>`: marca EM PRODUÇÃO, baixa e transcreve (pode levar alguns minutos). A saída traz o id do carrossel e a pasta.
3. REGRA DO DAVI (15/10/2026): mude o MÍNIMO em relação ao reel. A página 1 é a headline do reel, com as palavras que ele falou (pode ser longa; só ajuste se não couber). As outras páginas seguem as ideias e as frases do vídeo, na ordem dele; corte, mas não reescreva com palavras suas. Se achar que outro título funcionaria melhor (ex.: mais curto), NÃO troque: ponha em "opcoes": ["...", "..."] naquela página (2 ou 3), que o Davi escolhe na revisão.
   Leia a transcricao.txt e escreva <pasta>/conteudo.json seguindo as regras do manual (item 3 da Parte D) e o formato de scripts/roy/render.py:
   - 6 a 8 páginas, última com chamada para ação;
   - *destaque* em vermelho;
   - legenda (caption) no padrão das anteriores, com INSTALIVROS no fim;
   - se citar filme, livro ou vídeo, use a capa real (scripts/roy/capas.py) e olhe a imagem;
   - esculturas: use as que já existem (`python3 scripts/roy/ilustracoes.py listar`); só gere nova se existir ~/.infopro-hub/roy/config.json, porque custa dinheiro.
4. Confira o visual: `python3 scripts/roy/render.py <pasta>` e `python3 scripts/roy/roy.py revisar <pasta>`. Olhe os PNGs e corrija o que precisar.
   NÃO rode `roy.py renderizar`: o serviço faz isso depois e manda para a revisão do Davi.
5. Não publique nada no Instagram.

No fim, escreva 1 ou 2 frases simples em português para o Davi dizendo o que você fez. Na ÚLTIMA linha, só isto:
CARROSSEIS: <id do carrossel>[,<outro id>]"""


def _roy_id():
    r = roy.db("SELECT id FROM public.membros WHERE cliente_id = %s AND eh_ia AND lower(nome) = 'roy' LIMIT 1", (roy.CLIENTE,))
    return r[0][0] if r else None


_tentadas = set()  # falhou nesta execução: não tenta de novo em loop (reiniciar o serviço tenta)

# Falha do código do Roy (ex.: ImportError porque o ouvinte mudou e um módulo
# antigo ficou na memória), não do conteúdo: o serviço sai, o launchd religa
# com tudo novo e a mesma tarefa é tentada mais uma vez. O arquivo lembra quem
# já teve essa chance, para não reiniciar em loop.
ERROS_DE_CODIGO = (ImportError, AttributeError, SyntaxError, NameError)
REINICIADAS = render.BASE / "tarefas_reiniciadas.json"


def _reiniciadas():
    try:
        return set(json.loads(REINICIADAS.read_text()))
    except (OSError, ValueError):
        return set()


def _marcar_reiniciada(aid, sim=True):
    ids = _reiniciadas()
    ids = ids | {aid} if sim else ids - {aid}
    REINICIADAS.write_text(json.dumps(sorted(ids)))


def atender_tarefa():
    """Atividade na fila do Roy (o Davi passou pelo Infopro) → carrossel pronto
    para revisão; a tarefa fica 'aguardando_aprovacao' até ele aprovar."""
    roy_id = _roy_id()
    if not roy_id:
        return False
    linha = roy.db("""UPDATE public.atividades a SET situacao = 'andamento', progresso = 5,
                        observacao = 'Roy começou: escolhendo o reel…'
                      WHERE a.id = (SELECT a2.id FROM public.atividades a2
                                    WHERE a2.cliente_id = %s AND a2.responsavel_id = %s AND a2.deleted_at IS NULL
                                      AND NOT a2.concluida AND coalesce(a2.situacao, 'fila') = 'fila'
                                      -- "Começar agora" (▶️, botão da fila do Davi): tenta de novo mesmo se já falhou.
                                      AND (NOT (a2.id = ANY(%s::uuid[])) OR coalesce(a2.observacao, '') LIKE '▶️%%')
                                      -- Página e quiz são feitos pela execução (scripts/empresa/execucao.py).
                                      AND coalesce(a2.tipo, '') NOT IN ('pagina', 'quiz', 'estudo')
                                    ORDER BY a2.created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                      RETURNING a.id, a.titulo, a.descricao""", (roy.CLIENTE, roy_id, list(_tentadas)))
    if not linha:
        return False
    aid, titulo, descricao = str(linha[0][0]), linha[0][1], linha[0][2] or ""
    log("tarefa:", titulo[:150])
    try:
        ok, texto = _ouvinte().rodar_claude(PROMPT_TAREFA.format(titulo=titulo, descricao=descricao, cliente=roy.CLIENTE), minutos=45)
        if not ok:
            raise RuntimeError(texto)
        m = re.search(r"CARROSSEIS:\s*([0-9a-f,\s-]+)\s*$", texto.strip())
        ids = [x.strip() for x in (m.group(1).split(",") if m else []) if re.fullmatch(r"[0-9a-f-]{36}", x.strip())]
        if not ids:
            raise RuntimeError("não saiu carrossel nenhum (" + texto.strip()[-200:] + ")")
        resumo = re.sub(r"\n?CARROSSEIS:.*$", "", texto.strip()).strip()
        log("claude:", resumo[:300], "|", ids)
        prontos = []
        for cid in ids:
            roy.db("UPDATE public.carrosseis SET atividade_roy_id = %s WHERE id = %s", (aid, cid))
            roy.db("UPDATE public.atividades SET progresso = 60, observacao = 'Roy: montando as páginas…' WHERE id = %s", (aid,))
            if roy.renderizar(cid):
                prontos.append(roy.db("SELECT numero, tema FROM public.carrosseis WHERE id = %s", (cid,))[0])
        if not prontos:
            raise RuntimeError("a revisão automática barrou o carrossel (veja em Precisa de você)")
        lista = "; ".join(f"{n:03d} · {t}" for n, t in prontos)
        roy.db("""UPDATE public.atividades SET situacao = 'aguardando_aprovacao', progresso = 100, observacao = %s WHERE id = %s""",
               (f"Pronto para sua revisão em Conteúdo → Visão geral → Precisa de você: {lista}. {resumo}"[:900], aid))
        log("tarefa pronta:", lista)
        if aid in _reiniciadas():
            _marcar_reiniciada(aid, False)
    except Exception as e:
        log("tarefa falhou:", titulo[:80], traceback.format_exc()[-500:])
        if isinstance(e, ERROS_DE_CODIGO):
            if aid not in _reiniciadas() and "--uma-vez" not in sys.argv:
                _marcar_reiniciada(aid)
                roy.db("""UPDATE public.atividades SET situacao = 'fila', progresso = NULL, observacao = %s
                          WHERE id = %s AND situacao = 'andamento'""",
                       ("Roy: deu um erro no meu código (não na tarefa). Estou reiniciando para tentar de novo…", aid))
                log("erro de código: saindo para o launchd religar e tentar de novo")
                sys.exit(1)
            erro = ("⚠️ Erro no código do Roy (não é nada da tarefa); tentei de novo e não deu. "
                    "Ficou no log para o Pedro corrigir; quando o Roy for reiniciado, eu tento de novo sozinho.")
        else:
            erro = f"⚠️ Não consegui fazer sozinho: {str(e).strip()[:400]}"
        _tentadas.add(aid)
        roy.db("""UPDATE public.atividades SET situacao = 'fila', progresso = NULL, observacao = %s
                  WHERE id = %s AND situacao = 'andamento'""", (erro, aid))
    return True


# Último sinal (16/10): a cada minuto, numa thread própria (o laço principal fica
# preso enquanto o Claude trabalha). A Visão geral mostra "Roy parado desde
# HH:MM" quando passa de 3 min sem sinal.
_iniciado_em = datetime.now(timezone.utc)


def gravar_sinal():
    while True:
        try:
            roy.db("""INSERT INTO public.servicos_sinal (user_id, servico, ultimo_sinal, iniciado_em)
                       SELECT user_id, 'roy', now(), %s FROM public.clientes WHERE id = %s
                       ON CONFLICT (user_id, servico) DO UPDATE
                       SET ultimo_sinal = now(), iniciado_em = EXCLUDED.iniciado_em""", (_iniciado_em, roy.CLIENTE))
        except Exception as e:  # rede caiu etc.: tenta de novo na próxima volta
            log("sinal: erro —", repr(e)[:200])
        time.sleep(60)


if __name__ == "__main__":
    if "--uma-vez" in sys.argv:
        while atender() or atender_tarefa():
            pass
        sys.exit(0)
    log("serviço do Roy iniciado")
    threading.Thread(target=gravar_sinal, daemon=True).start()
    ultima_drive = 0.0
    while True:
        try:
            if atender():  # ajustes primeiro: são rápidos e o Davi está esperando
                continue
            if atender_tarefa():
                continue
            if time.time() - ultima_drive > 300:  # a cada 5 min: pastas do Drive que ficaram pendentes
                ultima_drive = time.time()
                try:
                    if roy.drive_pendentes():
                        log("Drive: pasta pendente gravada")
                except OSError as e:
                    log("Drive ainda travado:", str(e)[:200])
        except Exception as e:  # rede caiu etc.
            log("erro no laço:", repr(e)[:300])
            time.sleep(30)
        time.sleep(20)
