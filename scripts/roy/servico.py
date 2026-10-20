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

PROMPT_ESCOLHER = """Você é o Roy, o criador de carrosséis do @eu.davioficial (projeto Infopro Hub). Está rodando em segundo plano: o Davi não vê este terminal.

Leia docs/agentes/roy-carrossel.md (manual e Parte E) e os seus aprendizados com o Davi: `python3 scripts/inteligencia/ler.py --cliente {cliente} --agente roy` (os "SIGA SEMPRE" do topo valem sempre).

O Davi te passou esta tarefa no Infopro:
---
{titulo}
{descricao}
---
{ja_feitos}
NESTA ETAPA você só ESCOLHE os reels e começa cada carrossel; o conteúdo de cada um é escrito depois, numa etapa própria.
1. `python3 scripts/roy/roy.py candidatos 30`: reels ainda não usados, do mais novo para o mais antigo. Escolha conforme a tarefa (se ela citar reels ou temas, use esses; se pedir os que mais performaram, considere isso). Quantos: o que a tarefa pedir (1 se não disser). Não repita assunto de carrossel que já existe (veja os nomes das pastas: `python3 -c "import sys; sys.path.insert(0, 'scripts/roy'); import drive; print(chr(10).join(sorted(drive.pastas())))"`). Pule vídeo sem fala útil.
2. Para CADA escolhido: `python3 scripts/roy/roy.py iniciar <media_id> --tarefa {tarefa}` (marca EM PRODUÇÃO ligado a esta tarefa, baixa e transcreve; leva 1 a 2 minutos cada). Se um falhar, siga com os outros.
3. NÃO escreva conteudo.json, NÃO rode render.py nem renderizar. Não publique nada.

No fim, 1 frase simples em português para o Davi dizendo quais reels você escolheu. Na ÚLTIMA linha, só isto:
CARROSSEIS: <id>[,<id>...]"""

PROMPT_CONTEUDO = """Você é o Roy, o criador de carrosséis do @eu.davioficial (projeto Infopro Hub). Está rodando em segundo plano: o Davi não vê este terminal.

Leia docs/agentes/roy-carrossel.md (manual, Parte E e regras das capas reais) e os seus aprendizados com o Davi: `python3 scripts/inteligencia/ler.py --cliente {cliente} --agente roy` (os "SIGA SEMPRE" do topo valem sempre).

Tarefa do Davi (contexto): {titulo}

Escreva o conteúdo de UM carrossel: pasta {pasta} (transcricao.txt = a fala do reel; fonte.json = o reel).
1. REGRA DO DAVI (15/10/2026): mude o MÍNIMO em relação ao reel. A página 1 é a headline do reel, com as palavras que ele falou (pode ser longa; só ajuste se não couber). As outras páginas seguem as ideias e as frases do vídeo, na ordem dele; corte, mas não reescreva com palavras suas. Se achar que outro título funcionaria melhor (ex.: mais curto), NÃO troque: ponha em "opcoes": ["...", "..."] naquela página (2 ou 3), que o Davi escolhe na revisão.
2. Escreva {pasta}/conteudo.json seguindo as regras do manual (item 3 da Parte D) e o formato de scripts/roy/render.py:
   - 6 a 8 páginas, última com chamada para ação;
   - *destaque* em vermelho;
   - legenda (caption) no padrão das anteriores, com INSTALIVROS no fim;
   - se citar filme, livro ou vídeo, use a capa real (scripts/roy/capas.py) e olhe a imagem;
   - esculturas: use as que já existem (`python3 scripts/roy/ilustracoes.py listar`); só gere nova se o tema pedir muito, porque custa dinheiro.
3. Confira: `python3 scripts/roy/render.py {pasta}` e `python3 scripts/roy/roy.py revisar {pasta}`. Olhe os PNGs e corrija o que precisar.
   NÃO rode `roy.py renderizar`: o serviço faz isso depois e manda para a revisão do Davi. Não publique nada.

No fim, 1 frase simples em português dizendo o que você fez."""


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


TAREFAS = render.BASE / "tarefas"  # <aid>.json: a escolha dos reels do lote já foi feita


def _carrosseis_da_tarefa(aid):
    return roy.db("SELECT id, numero, tema, status FROM public.carrosseis WHERE atividade_roy_id = %s ORDER BY numero", (aid,)) or []


def _progresso(aid, texto, pct):
    roy.db("UPDATE public.atividades SET progresso = %s, observacao = %s WHERE id = %s AND situacao = 'andamento'", (pct, texto[:900], aid))


def retomar_interrompidas():
    """Ao ligar: tarefa do Roy que ficou 'andamento' é de um serviço que caiu no meio
    (só existe um). Volta pra fila e é retomada de onde parou (os carrosséis estão no banco)."""
    roy_id = _roy_id()
    if roy_id:
        n = roy.db("""UPDATE public.atividades SET situacao = 'fila', observacao = '▶️ Roy retomando de onde parou…'
                      WHERE cliente_id = %s AND responsavel_id = %s AND situacao = 'andamento' AND deleted_at IS NULL
                        AND NOT concluida AND coalesce(tipo, '') NOT IN ('pagina', 'quiz', 'estudo') RETURNING id""",
                   (roy.CLIENTE, roy_id))
        if n:
            log("retomando tarefas interrompidas:", [str(x[0]) for x in n])
    # Ajuste pedido na tela de revisão que estava no meio quando o serviço caiu (20/10: "Quem mexeu no
    # meu queijo" ficou 4 h em "Roy está ajustando…"): volta para 'ajuste' e o Roy refaz o pedido.
    a = roy.db("""UPDATE public.carrosseis SET status = 'ajuste', mensagem = 'Retomando seu pedido (o Roy reiniciou no meio)…',
                    atualizado_em = now()
                  WHERE cliente_id = %s AND status = 'produzindo' AND feedback IS NOT NULL
                    AND (mensagem LIKE 'Roy está ajustando%%' OR mensagem LIKE 'Roy recebeu seu pedido%%') RETURNING tema""",
               (roy.CLIENTE,))
    if a:
        log("retomando ajustes interrompidos:", [x[0] for x in a])


def atender_tarefa():
    """Atividade na fila do Roy (o Davi passou pelo Infopro) → carrosséis prontos
    para revisão; a tarefa fica 'aguardando_aprovacao' até ele aprovar.
    Em etapas (17/10, o lote de 7 numa rodada só estourou o tempo):
      1) escolher: uma rodada do Claude só escolhe os reels e roda `iniciar --tarefa`;
      2) conteúdo: uma rodada por carrossel que ainda não tem conteudo.json;
      3) finalizar: roy.renderizar (revisão automática, Drive, Storage) → 'revisar'.
    Tudo fica no banco, então se cair no meio é retomado sem duplicar."""
    roy_id = _roy_id()
    if not roy_id:
        return False
    linha = roy.db("""UPDATE public.atividades a SET situacao = 'andamento', progresso = 5,
                        observacao = 'Roy começou: escolhendo os reels…'
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
    TAREFAS.mkdir(parents=True, exist_ok=True)
    marca = TAREFAS / f"{aid}.json"
    resumo = ""
    try:
        # 1) Escolher (só uma vez por tarefa).
        if not marca.exists():
            feitos = _carrosseis_da_tarefa(aid)
            ja = ("\nJá existem carrosséis desta tarefa (não repita, comece só os que faltam): "
                  + "; ".join(f"{n:03d} · {t}" for _, n, t, _ in feitos) + "\n") if feitos else ""
            ok, texto = _ouvinte().rodar_claude(PROMPT_ESCOLHER.format(titulo=titulo, descricao=descricao, cliente=roy.CLIENTE,
                                                                        tarefa=aid, ja_feitos=ja), minutos=45)
            resumo = re.sub(r"\n?CARROSSEIS:.*$", "", (texto or "").strip()).strip() if ok else ""
            log("escolha:", "ok" if ok else f"não-ok ({(texto or '')[:200]})", "|", resumo[:200])
            if not _carrosseis_da_tarefa(aid):
                raise RuntimeError(texto if not ok else "não escolhi reel nenhum (" + (texto or "").strip()[-200:] + ")")
            marca.write_text(json.dumps({"escolha": "ok" if ok else "parcial", "quando": datetime.now().isoformat()}))
        # 2) Conteúdo, um por vez; 3) finalizar.
        lista = [c for c in _carrosseis_da_tarefa(aid) if c[3] in ("produzindo",)]
        total = len(_carrosseis_da_tarefa(aid))
        for k, (cid, num, tema, _) in enumerate(lista, 1):
            cid = str(cid)
            pasta = roy.TRABALHO / cid
            try:  # entre um carrossel e outro, atende os ajustes que o Davi pediu (são rápidos)
                while atender():
                    pass
            except Exception as e:
                log("ajuste no meio do lote: erro —", repr(e)[:200])
            feitos_agora = total - len(lista) + k - 1
            try:
                if not (pasta / "conteudo.json").exists():
                    _progresso(aid, f"Roy: escrevendo o carrossel {num:03d} · {tema} ({feitos_agora + 1} de {total})…", 10 + 80 * feitos_agora // max(total, 1))
                    ok, texto = _ouvinte().rodar_claude(PROMPT_CONTEUDO.format(titulo=titulo, pasta=pasta, cliente=roy.CLIENTE), minutos=25)
                    if not (pasta / "conteudo.json").exists():
                        raise RuntimeError(texto if not ok else "o conteúdo não foi escrito")
                    json.loads((pasta / "conteudo.json").read_text())
                _progresso(aid, f"Roy: montando as páginas do {num:03d} · {tema} ({feitos_agora + 1} de {total})…", 10 + 80 * feitos_agora // max(total, 1))
                roy.renderizar(cid)  # revisão automática barrando → 'erro' com o motivo (aparece em Precisa de você)
            except Exception as e:  # um carrossel com problema não derruba os outros
                log("carrossel falhou:", num, traceback.format_exc()[-400:])
                roy.db("UPDATE public.carrosseis SET status = 'erro', mensagem = %s, atualizado_em = now() WHERE id = %s",
                       (f"Roy não conseguiu terminar: {str(e).strip()[:250]}", cid))
                if isinstance(e, ERROS_DE_CODIGO):
                    raise
        prontos = [(n, t) for _, n, t, st in _carrosseis_da_tarefa(aid) if st in ("revisar", "aprovado", "programado", "publicado")]
        problema = [(n, t) for _, n, t, st in _carrosseis_da_tarefa(aid) if st == "erro"]
        if not prontos:
            raise RuntimeError("nenhum carrossel passou na revisão automática (veja em Precisa de você)")
        txt = "; ".join(f"{n:03d} · {t}" for n, t in prontos)
        extra = (" Com problema (veja em Precisa de você): " + "; ".join(f"{n:03d}" for n, _ in problema) + ".") if problema else ""
        roy.db("""UPDATE public.atividades SET situacao = 'aguardando_aprovacao', progresso = 100, observacao = %s WHERE id = %s""",
               (f"Pronto para sua revisão em Conteúdo → Visão geral → Precisa de você: {txt}.{extra} {resumo}"[:900], aid))
        log("tarefa pronta:", txt, extra)
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
            erro = f"⚠️ Não consegui fazer sozinho: {(str(e).strip() or 'o Claude parou sem resposta (tempo esgotado?)')[:400]}"
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
    retomar_interrompidas()
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
