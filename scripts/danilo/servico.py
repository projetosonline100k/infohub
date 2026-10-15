"""Serviço do Danilo em segundo plano (LaunchAgent com.infoprohub.danilo-servico,
ver scripts/danilo/instalar.sh). O Davi só joga o bruto no Drive:

  - Bruto novo em Eu.davi › Precisa de edição → [EM EDIÇÃO], transcreve, descobre
    o card pela fala (roteiros em Gravação), move o card pra Edição, o Claude em
    segundo plano (`claude -p`) edita seguindo o manual, e a prévia vai pra
    "Precisa de você › Revisar edição". Aprovar entrega no Drive (servidor.py).
  - Vários brutos de uma vez: edita UM piloto e espera o Davi aprovar antes
    dos outros (estado em ~/.infopro-hub/danilo/servico.json).
  - Atividade na fila do Danilo (o Davi passa pelo Infopro): o Claude faz e a
    tarefa fica 'aguardando_aprovacao'.

Não publica nada. Log em ~/.infopro-hub/danilo/servico.log.

    python3 scripts/danilo/servico.py           # roda (o LaunchAgent faz isso)
    python3 scripts/danilo/servico.py --uma-vez # processa o que houver e sai
"""
import importlib.util
import json
import re
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(AQUI))
import danilo  # noqa: E402

LOG = danilo.BASE / "servico.log"
ESTADO = danilo.BASE / "servico.json"


def log(*partes):
    linha = f"[{datetime.now():%d/%m %H:%M:%S}] " + " ".join(str(p) for p in partes)
    with open(LOG, "a") as f:
        f.write(linha + "\n")
    print(linha, flush=True)


def estado():
    return json.loads(ESTADO.read_text()) if ESTADO.exists() else {}


def salvar_estado(e):
    ESTADO.write_text(json.dumps(e, ensure_ascii=False, indent=1))


def _ouvinte():
    spec = importlib.util.spec_from_file_location("jarvis_ouvinte", RAIZ / "scripts" / "jarvis-ouvinte.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rodar_claude(prompt, minutos, turnos=200):
    """Igual ao do ouvinte do Jarvis (mesmo login), com mais voltas: editar um
    vídeo pede muitas idas e vindas (ouvir trechos, baixar pinturas, conferir)."""
    import os
    import subprocess
    ouvinte = _ouvinte()
    binario = ouvinte.claude_bin()
    if not binario:
        return False, "Claude Code não encontrado neste Mac (abra o app do Claude uma vez)."
    cmd = [binario, "-p", prompt, "--output-format", "json", "--max-turns", str(turnos),
           "--allowedTools", "Bash", "Read", "Grep", "Glob", "Edit", "Write", "WebSearch", "WebFetch"]
    try:
        r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, timeout=minutos * 60,
                           env={**os.environ, "PATH": f"{Path(sys.executable).parent}:/usr/bin:/bin:/usr/sbin:/sbin"})
    except subprocess.TimeoutExpired:
        return False, f"O Claude passou de {minutos} min e foi interrompido."
    try:
        dados = json.loads(r.stdout)
    except ValueError:
        return False, (r.stderr or r.stdout or "sem resposta").strip()[:300]
    texto = (dados.get("result") or "").strip()
    return not dados.get("is_error"), texto


def _danilo_id():
    r = danilo.db("SELECT id FROM public.membros WHERE cliente_id = %s AND eh_ia AND lower(nome) = 'danilo' LIMIT 1",
                  (danilo.CLIENTE,))
    return r[0][0] if r else None


def progresso(aid, p, obs, situacao=None):
    if aid:
        danilo.db("UPDATE public.atividades SET progresso = %s, observacao = %s, situacao = coalesce(%s, situacao) WHERE id = %s",
                  (p, obs[:900], situacao, aid))


PROMPT_EDICAO = """Você é o Danilo, o editor de vídeos (IA) do Eu.daviqueiroz (projeto Infopro Hub). Está rodando em segundo plano: o Davi não vê este terminal.

Leia primeiro docs/agentes/danilo-editor.md inteiro (manual do Davi, partes 1–22, e a Parte B/C) e os seus aprendizados com o Davi: `python3 scripts/inteligencia/ler.py --cliente {cliente} --agente danilo` (os "SIGA SEMPRE" valem sempre).
{referencia}
O bruto já foi preparado. Edição {id}, pasta {pasta}:
- bruto.* (cópia local), audio.wav, transcricao.json (whisper palavra a palavra), contexto.json (card e roteiro, se achei), imagens/musica.ogg (Gymnopédie nº 1, CC0, já aprovada).
- Ferramentas: `python3 scripts/danilo/danilo.py` (texto, ouvir, quadros, pintura buscar/baixar, montar, conferir). Rode tudo da raiz do repositório.

Faça a edição assim:
1. `danilo.py texto {id}`: leia a fala inteira e compare com o roteiro do contexto.json.
2. Ache as RETOMADAS (frase repetida, tomada incompleta). O whisper do bruto inteiro costuma PULAR uma das tomadas repetidas e inventar "3º", "4º", "5º" nas emendas: em todo trecho com som e sem texto, em toda pausa longa e em cada tópico, rode `danilo.py ouvir {id} <ini> <fim>` para ouvir palavra a palavra. Fique com a tomada completa e correta (em geral a última). Repetição de reforço ("coloca no frio. Coloca na água gelada.") fica.
   Se o whisper errou palavras, corrija o transcricao.json (tire palavras inventadas, ponha as que faltam com os tempos do `ouvir`).
3. Escreva {pasta}/escolhas.json (formato no topo de scripts/danilo/criar_projeto.py):
   - "fim_fala": fim da última frase boa (corte o que vier depois, inclusive repetição do CTA).
   - "palavras_head" e "blocos_head": a headline é a fala exata do gancho (1ª frase), em blocos de 2–4 palavras.
   - "cortes": as retomadas que você achou, com o motivo.
   - "correcoes": nomes próprios ("David"→"Davi"), "InstaLivros"→"INSTALIVROS" etc.
   - "midias": 2 pinturas lado a lado na abertura (logo depois da headline, ~10 s: x 95/560, y 1180, w 425, h 450) e UMA pintura diferente por tópico (~7 s a partir do começo do tópico, centralizada: x=(1080-w)/2, y 1180, w 480–660, h 450–480). Escolha pinturas clássicas que traduzam a ideia daquele trecho: `danilo.py pintura buscar "<termos em inglês>"` e `danilo.py pintura baixar {id} abertura1 "File:..."` (só baixa domínio público/CC e registra a fonte). Olhe a imagem baixada antes de usar. Nada repetido.
   - "musica": {{"arquivo": "{pasta}/imagens/musica.ogg", "volume": 0.07}}.
   - "enfases": 2 ou 3 tempos de frases de impacto (zoom seco).
   - "destaques": se falar INSTALIVROS: [{{"texto": "INSTALIVROS", "inicio": <1ª menção>}}].
4. `danilo.py montar {id}` e depois `danilo.py conferir {id}`: leia a transcrição da PRÉVIA (a fala tem que correr inteira, sem tomada repetida, sem palavra cortada) e olhe {pasta}/_conferir.jpg (headline, legendas e pinturas sem cobrir o rosto). Corrija e repita até ficar certo.
5. Não publique nada, não mexa no Drive (o serviço cuida) e não rode o servidor.

No fim, escreva 2 ou 3 frases simples em português para o Davi: o que cortou, as pinturas e o que ele deve olhar (dúvidas suas, como reforço x retomada ou falta do vídeo de fundo verde do INSTALIVROS). Na ÚLTIMA linha, só isto:
PRONTO: {id}"""


def _referencia(e):
    """Piloto aprovado do lote: os outros seguem o que o Davi ajustou nele."""
    piloto = e.get("piloto")
    if not piloto:
        return ""
    return (f"\nEste vídeo é do mesmo lote do piloto aprovado (edição {piloto}, pasta {danilo.pasta(piloto)}). "
            "Compare o escolhas.json e o projeto.json dele (e as versões em versoes/) para ver o que o Davi mudou "
            "no mini editor, e faça este vídeo com os mesmos ajustes.\n")


def editar(arquivo, e):
    nome = Path(arquivo).name
    log("bruto novo:", nome)
    id_ = danilo.preparar(arquivo, log=log)
    ctx = json.loads((danilo.pasta(id_) / "contexto.json").read_text())
    titulo = (ctx.get("card") or {}).get("titulo") or nome
    danilo._msg(id_, "Danilo editando: retomadas, headline, pinturas…")
    ok, texto = rodar_claude(PROMPT_EDICAO.format(id=id_, pasta=danilo.pasta(id_), cliente=danilo.CLIENTE,
                                                             referencia=_referencia(e)), minutos=75)
    if not ok or f"PRONTO: {id_}" not in texto:
        raise RuntimeError(f"o Claude não terminou a edição: {(texto or '')[-250:]}")
    resumo = re.sub(r"\n?PRONTO:.*$", "", texto.strip()).strip()
    log("claude:", resumo[:400])
    st = danilo.nova_versao(id_)
    if st[0] == "erro":
        raise RuntimeError(st[1] or "a prévia falhou")
    aviso = "" if ctx.get("card") else " Não achei o card deste vídeo pela fala: me diga qual é."
    danilo.db("UPDATE public.edicoes_video SET mensagem = %s WHERE id = %s", (f"Danilo: {resumo[:500]}{aviso}", id_))
    danilo.ligar_tarefas()
    log("pronto para revisão:", titulo)
    return id_


def atender_drive():
    """Um bruto por vez. Lote com vários: piloto primeiro."""
    e = estado()
    if e.get("aguardando_piloto"):
        st = danilo.db("SELECT status FROM public.edicoes_video WHERE id = %s", (e["aguardando_piloto"],))
        if st and st[0][0] == "aprovado":
            e["piloto"] = e.pop("aguardando_piloto")
            salvar_estado(e)
            log("piloto aprovado: seguindo com o resto do lote")
            progresso(e.get("atividade"), 25, "Piloto aprovado. Agora: editando os outros vídeos do lote com os mesmos ajustes.",
                      "andamento")
        elif st and st[0][0] != "cancelado":
            return False                     # o Davi ainda não aprovou o piloto
        else:
            e.pop("aguardando_piloto")
            salvar_estado(e)
    brutos = danilo.novos()
    if not brutos:
        if e.get("piloto") or e.get("atividade"):
            progresso(e.get("atividade"), 100, "Lote editado: todos os vídeos estão em Precisa de você › Revisar edição.",
                      "aguardando_aprovacao")
            salvar_estado({})
        return False
    piloto = len(brutos) > 1 and not e.get("piloto")
    try:
        id_ = editar(brutos[0], e)
    except Exception as erro:
        log("edição falhou:", brutos[0].name, traceback.format_exc()[-600:])
        r = danilo.db("SELECT id FROM public.edicoes_video WHERE bruto_drive LIKE %s ORDER BY criado_em DESC LIMIT 1",
                      (f"%{brutos[0].name}",))
        if r:
            danilo.db("UPDATE public.edicoes_video SET status = 'erro', mensagem = %s WHERE id = %s",
                      (f"Danilo não conseguiu editar sozinho: {str(erro)[:250]}", r[0][0]))
        return True
    e["feitos"] = e.get("feitos", 0) + 1
    e.setdefault("total", e["feitos"] + len(brutos) - 1)
    if piloto:
        e["aguardando_piloto"] = id_
        log("piloto do lote em revisão; os outros", len(brutos) - 1, "esperam a aprovação")
    salvar_estado(e)
    if e.get("atividade"):
        if piloto:
            progresso(e["atividade"], 20, "Piloto pronto em Precisa de você › Revisar edição. Quando aprovar, edito os outros "
                      "com os mesmos ajustes.", "aguardando_aprovacao")
        else:
            progresso(e["atividade"], int(20 + 80 * e["feitos"] / max(e["total"], 1)),
                      f"Agora: {e['feitos']} de {e['total']} prontos em Revisar edição; editando o próximo.")
    return True


# ---------------------------------------------------------------- tarefas do Danilo
PROMPT_TAREFA = """Você é o Danilo, o editor de vídeos (IA) do Eu.daviqueiroz (projeto Infopro Hub). Está rodando em segundo plano: o Davi não vê este terminal.

Leia primeiro docs/agentes/danilo-editor.md inteiro e os seus aprendizados: `python3 scripts/inteligencia/ler.py --cliente {cliente} --agente danilo`.

O Davi te passou esta tarefa no Infopro:
---
{titulo}
{descricao}
---

Editar brutos que estão em Eu.davi › Precisa de edição NÃO é com você aqui: o serviço do Danilo pega sozinho (piloto primeiro). Se a tarefa for só isso, não faça nada e responda que o serviço já está cuidando.
Para outros pedidos (ex.: refazer algo numa edição existente em ~/.infopro-hub/danilo/edicoes/<id>/), use `python3 scripts/danilo/danilo.py` (montar, conferir, ouvir, pintura…).
Não publique nada e não mande mensagem para ninguém.

No fim, escreva 1 ou 2 frases simples em português para o Davi dizendo o que você fez."""

_tentadas = set()


def atender_tarefa():
    did = _danilo_id()
    if not did:
        return False
    linha = danilo.db("""UPDATE public.atividades a SET situacao = 'andamento', progresso = 5,
                           observacao = 'Danilo começou: lendo a tarefa…'
                         WHERE a.id = (SELECT a2.id FROM public.atividades a2
                                       WHERE a2.cliente_id = %s AND a2.responsavel_id = %s AND a2.deleted_at IS NULL
                                         AND NOT a2.concluida AND coalesce(a2.situacao, 'fila') = 'fila'
                                         AND NOT (a2.id = ANY(%s::uuid[]))
                                         -- "Editar: <vídeo>" é do laço do Drive (danilo.ligar_tarefas).
                                         AND NOT (coalesce(a2.tipo, '') = 'edicao' AND a2.video_vertical_id IS NOT NULL)
                                       ORDER BY a2.created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                         RETURNING a.id, a.titulo, a.descricao""", (danilo.CLIENTE, did, list(_tentadas)))
    if not linha:
        return False
    aid, titulo, descricao = str(linha[0][0]), linha[0][1], linha[0][2] or ""
    log("tarefa:", titulo[:150])
    # Pedido de editar os brutos da pasta: o laço do Drive faz; a tarefa acompanha o lote.
    if re.search(r"precisa de edi[cç][aã]o", f"{titulo} {descricao}", re.I) and re.search(r"edit", titulo, re.I):
        e = estado()
        e["atividade"] = aid
        salvar_estado(e)
        progresso(aid, 10, "Agora: editando os brutos da pasta Precisa de edição (piloto primeiro).")
        return True
    try:
        ok, texto = rodar_claude(PROMPT_TAREFA.format(titulo=titulo, descricao=descricao, cliente=danilo.CLIENTE),
                                 minutos=45, turnos=80)
        if not ok:
            raise RuntimeError(texto)
        progresso(aid, 100, f"Danilo: {texto.strip()[:800]}", "aguardando_aprovacao")
    except Exception as erro:
        _tentadas.add(aid)
        log("tarefa falhou:", titulo[:80], traceback.format_exc()[-500:])
        danilo.db("""UPDATE public.atividades SET situacao = 'fila', progresso = NULL, observacao = %s
                     WHERE id = %s AND situacao = 'andamento'""", (f"⚠️ Não consegui fazer sozinho: {str(erro).strip()[:400]}", aid))
    return True


if __name__ == "__main__":
    if "--uma-vez" in sys.argv:
        danilo.ligar_tarefas()
        while atender_tarefa() or atender_drive():
            pass
        sys.exit(0)
    log("serviço do Danilo iniciado")
    ultima_drive = 0.0
    while True:
        try:
            danilo.ligar_tarefas()
            if atender_tarefa():
                continue
            if time.time() - ultima_drive > 300:      # a cada 5 min olha a pasta do Drive
                ultima_drive = time.time()
                if atender_drive():
                    ultima_drive = 0.0                # editou um: já olha o próximo
        except OSError as erro:
            log("Drive/rede:", str(erro)[:200])
            time.sleep(60)
        except Exception as erro:
            log("erro no laço:", repr(erro)[:300])
            time.sleep(30)
        time.sleep(20)
