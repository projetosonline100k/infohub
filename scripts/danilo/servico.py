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
import threading
import time
import traceback
from datetime import datetime, timezone
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


MIN_POR_VIDEO = 35   # baixar, transcrever, editar e gerar a prévia (medido nos primeiros)
ALERTA = "⚠️ Não vou editar"
_alerta = ""         # bruto quebrado do lote: fica no topo de toda atualização da barra


def progresso(aid, p, obs, situacao=None, faltam_videos=None, espera_min=0):
    """Atualiza a barra da tarefa. faltam_videos → grava previsao_fim (o app usa
    ela em vez do ritmo desde o início, que conta as horas paradas)."""
    if not aid:
        return
    if _alerta:
        obs = f"{_alerta}\n{obs}"
    if faltam_videos is None:
        danilo.db("UPDATE public.atividades SET progresso = %s, observacao = %s, situacao = coalesce(%s, situacao) WHERE id = %s",
                  (p, obs[:900], situacao, aid))
    else:
        danilo.db("""UPDATE public.atividades SET progresso = %s, observacao = %s, situacao = coalesce(%s, situacao),
                       previsao_fim = now() + make_interval(mins => %s) WHERE id = %s""",
                  (p, obs[:900], situacao, int(faltam_videos * MIN_POR_VIDEO + espera_min), aid))


def no_lote(e, id_, nome, titulo):
    """Vídeo de um lote com tarefa: uma linha só no app. A tarefa "Editar: <card>"
    que a automação do card cria é juntada à do lote (apagada com deleted_at,
    a edição continua ligada ao card) e a barra do lote mostra o vídeo atual."""
    if not e.get("atividade"):
        return
    vid = danilo.db("SELECT video_vertical_id FROM public.edicoes_video WHERE id = %s", (id_,))[0][0]
    if vid:
        danilo.db("""UPDATE public.atividades SET deleted_at = now(),
                       observacao = 'Juntada à tarefa do lote (o andamento aparece lá).'
                     WHERE video_vertical_id = %s AND tipo = 'edicao' AND NOT concluida AND deleted_at IS NULL AND id <> %s""",
                  (vid, e["atividade"]))
    # Ligada à tarefa do lote: o chat do Danilo no editor vem dela (o servidor só
    # conclui a tarefa do lote quando o lote terminou e todas foram aprovadas).
    danilo.db("UPDATE public.edicoes_video SET atividade_id = %s WHERE id = %s", (e["atividade"], id_))
    n, total = e.get("feitos", 0) + 1, e.get("total", 0)
    progresso(e["atividade"], int(20 + 80 * (n - 1) / max(total, 1)),
              f"Agora: editando {Path(nome).stem} ({n} de {total}) · {titulo}", "andamento",
              faltam_videos=max(total - n, 0) + 0.8)


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
{formato_midias}
   - "musica": {{"arquivo": "{pasta}/imagens/musica.ogg", "volume": 0.07}}.
   - "enfases": 2 ou 3 tempos de frases de impacto (zoom seco).
   - "destaques": se falar INSTALIVROS: [{{"texto": "INSTALIVROS", "inicio": <1ª menção>}}].
{formato_passo}4. `danilo.py montar {id}` e depois `danilo.py conferir {id}`: leia a transcrição da PRÉVIA (a fala tem que correr inteira, sem tomada repetida, sem palavra cortada) e olhe {pasta}/_conferir.jpg (headline, legendas e pinturas sem cobrir o rosto). Corrija e repita até ficar certo.
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


MIDIAS_CLASSICO = """   - "midias": 2 pinturas lado a lado na abertura (logo depois da headline, ~10 s: x 95/560, y 1180, w 425, h 450) e UMA pintura diferente por tópico (~7 s a partir do começo do tópico, centralizada: x=(1080-w)/2, y 1180, w 480–660, h 450–480). Escolha pinturas clássicas que traduzam a ideia daquele trecho: `danilo.py pintura buscar "<termos em inglês>"` e `danilo.py pintura baixar {id} abertura1 "File:..."` (só baixa domínio público/CC e registra a fonte). Olhe a imagem baixada antes de usar. Nada repetido.
   - "formato": "classico"."""
MIDIAS_PAPEL = """   - FORMATO PAPEL ANIMADO (o Davi escolheu): "formato": "papel" e "midias": [] (sem pinturas). A tela fica dividida: em cima um papel onde cenas são desenhadas à mão acompanhando a fala, embaixo o vídeo (só a parte de cima do quadro aparece; legendas e headline continuam no lugar de sempre)."""
PASSO_PAPEL = """3b. Escreva {pasta}/papel_cenas.py com as cenas do papel. Leia antes o topo de scripts/danilo/papel.py (primitivas: traco, texto, circulo, marcatexto, boneco, prog; folha 940x560) e scripts/danilo/papel_exemplo.py (as 9 cenas do vídeo dos 4 hábitos que o Davi aprovou: copie o jeito). Uma cena por ideia da fala (gancho, cada tópico, a virada), cada uma começando no TEMPO DO BRUTO em que ele começa a falar dela (veja na transcricao.json); FIM = começo do CTA do INSTALIVROS, se houver (ali volta a tela cheia). Palavra-chave escrita à mão no instante em que ele fala; marca-texto amarelo na ênfase; vermelho na conclusão. Confira com `python3 scripts/danilo/papel.py contato {pasta}` e olhe {pasta}/_papel_contato.jpg: nada cortado na borda, nada encavalado; corrija até ficar limpo.
"""


def editar(arquivo, e):
    nome = arquivo.name
    log("bruto novo:", nome)
    id_ = danilo.preparar(arquivo, log=log)
    ctx = json.loads((danilo.pasta(id_) / "contexto.json").read_text())
    titulo = (ctx.get("card") or {}).get("titulo") or nome
    no_lote(e, id_, nome, titulo)
    danilo.perguntar_formato(id_)              # o Davi escolhe: clássico ou papel animado (18/10)
    log("esperando o Davi escolher o formato:", titulo)
    return id_


def editar_no_formato(id_, e):
    """O Davi escolheu o formato: agora o Claude edita (e, no papel, desenha as cenas)."""
    pasta = danilo.pasta(id_)
    ctx = json.loads((pasta / "contexto.json").read_text())
    nome = ctx.get("bruto") or id_
    titulo = (ctx.get("card") or {}).get("titulo") or nome
    formato = danilo.db("SELECT formato FROM public.edicoes_video WHERE id = %s", (id_,))[0][0] or "classico"
    log("editando", titulo, "no formato", formato)
    danilo._msg(id_, "Danilo editando: retomadas, headline, " + ("cenas do papel…" if formato == "papel" else "pinturas…"))
    ok, texto = rodar_claude(PROMPT_EDICAO.format(
        id=id_, pasta=pasta, cliente=danilo.CLIENTE, referencia=_referencia(e),
        formato_midias=(MIDIAS_PAPEL if formato == "papel" else MIDIAS_CLASSICO.format(id=id_)),
        formato_passo=(PASSO_PAPEL.format(pasta=pasta) if formato == "papel" else "")), minutos=90)
    if not ok or f"PRONTO: {id_}" not in texto:
        raise RuntimeError(f"o Claude não terminou a edição: {(texto or '')[-250:]}")
    resumo = re.sub(r"\n?PRONTO:.*$", "", texto.strip()).strip()
    log("claude:", resumo[:400])
    proj = json.loads((pasta / "projeto.json").read_text())
    if proj.get("formato") != formato:               # garante o formato escolhido (o motor decide por ele)
        proj["formato"] = formato
        (pasta / "projeto.json").write_text(json.dumps(proj, ensure_ascii=False, indent=1))
    st = danilo.nova_versao(id_)
    if st[0] == "erro":
        raise RuntimeError(st[1] or "a prévia falhou")
    aviso = "" if ctx.get("card") else " Não achei o card deste vídeo pela fala: me diga qual é."
    if "comprimido" in nome.lower():   # veio pelo WhatsApp como vídeo, não como documento (~720p)
        aviso += (" ⚠️ Este bruto veio comprimido pelo WhatsApp (uns 720p): o final fica com menos qualidade."
                  " Para Full HD, mande no grupo como Documento.")
    danilo.db("UPDATE public.edicoes_video SET mensagem = %s WHERE id = %s", (f"Danilo: {resumo[:500]}{aviso}", id_))
    danilo.ligar_tarefas()
    log("pronto para revisão:", titulo)


def atender_formato():
    """Edição com o formato escolhido pelo Davi (status 'na_fila' + formato): edita."""
    linha = danilo.db("""UPDATE public.edicoes_video e SET status = 'editando', atualizado_em = now()
                         WHERE e.id = (SELECT id FROM public.edicoes_video WHERE cliente_id = %s AND status = 'na_fila'
                                       AND formato IS NOT NULL ORDER BY atualizado_em LIMIT 1 FOR UPDATE SKIP LOCKED)
                         RETURNING e.id""", (danilo.CLIENTE,))
    if not linha:
        return False
    id_ = str(linha[0][0])
    try:
        editar_no_formato(id_, estado())
    except Exception as erro:
        log("edição falhou:", id_, traceback.format_exc()[-600:])
        danilo.db("UPDATE public.edicoes_video SET status = 'erro', mensagem = %s WHERE id = %s",
                  (f"Danilo não conseguiu editar sozinho: {str(erro)[:250]}", id_))
    return True


LIVRE_MIN_GB = 3    # folga pra prévias e o final; se o bruto ainda não está no Mac, soma 2× o tamanho dele


def espaco_ok(e, bruto):
    """Sem espaço o Drive não entrega o bruto e a cópia fica esperando à toa.
    Então nem pega o vídeo: avisa na tarefa do lote (uma vez) e tenta no próximo ciclo."""
    import shutil
    livre = shutil.disk_usage(Path.home()).free / 1e9
    if isinstance(bruto, danilo.Remoto):        # vem pelo rclone: precisa caber a cópia
        precisa = LIVRE_MIN_GB + 1.2 * bruto.tamanho / 1e9
    else:
        precisa = LIVRE_MIN_GB + (0 if danilo.no_mac(bruto) else 2 * bruto.stat().st_size / 1e9)
    if livre >= precisa:
        if e.pop("sem_espaco", None):
            salvar_estado(e)
            log(f"espaço ok de novo ({livre:.0f} GB livres): seguindo")
        return True
    if not e.get("sem_espaco"):
        e["sem_espaco"] = True
        salvar_estado(e)
        log(f"parado: só {livre:.1f} GB livres no Mac (preciso de {precisa:.0f})")
        progresso(e.get("atividade"), None if not e.get("total") else int(20 + 80 * e.get("feitos", 0) / e["total"]),
                  f"⚠️ Parado: o Mac está com só {livre:.0f} GB livres e não cabe baixar e editar o próximo bruto. "
                  f"Libere uns {precisa - livre + 2:.0f} GB que eu continuo sozinho ({bruto.name.replace(danilo.EM_EDICAO, '')} é o próximo).")
    return False


def avisar_quebrados(e):
    """Bruto que chegou cortado é avisado logo que aparece no Mac, com o motivo,
    e não espera o resto do lote (antes o aviso só saía no fim, horas depois).
    O aviso fica no topo da observação da tarefa do lote até o Davi reenviar."""
    global _alerta
    for q in [q for q in danilo._quebrados if not Path(q).exists()]:
        danilo._quebrados.pop(q)                 # apagado ou trocado: some do aviso
    itens = [f"{Path(q).stem.replace(danilo.EM_EDICAO, '')} ({m})" for q, m in sorted(danilo._quebrados.items())]
    _alerta = (f"{ALERTA} {', '.join(itens)}. Mande de novo do celular e deixe o app do Drive aberto até "
               "terminar o envio (ou use AirDrop para a pasta Para o Danilo, na Mesa). Enquanto isso sigo com os outros."
               ) if itens else ""
    if _alerta == e.get("aviso_quebrados", ""):
        return
    e["aviso_quebrados"] = _alerta
    salvar_estado(e)
    log("brutos quebrados:", itens or "nenhum (reenviados)")
    if not e.get("atividade"):
        return
    r = danilo.db("SELECT coalesce(observacao, '') FROM public.atividades WHERE id = %s", (e["atividade"],))
    linhas = (r[0][0] if r else "").split("\n")
    if linhas[0].startswith(ALERTA):
        linhas = linhas[1:]                      # troca o aviso anterior pelo novo
    danilo.db("UPDATE public.atividades SET observacao = %s WHERE id = %s",
              ("\n".join(([_alerta] if _alerta else []) + linhas).strip()[:900], e["atividade"]))


def atender_drive():
    """Um bruto por vez. Lote com vários: piloto primeiro."""
    e = estado()
    brutos = danilo.novos()          # antes da espera do piloto: o bruto quebrado é avisado na hora
    avisar_quebrados(e)
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
    if not brutos and danilo._quebrados and e.get("atividade"):
        # Os outros estão prontos: o lote só espera o reenvio (o aviso já saiu em avisar_quebrados).
        if not e.get("esperando_reenvio"):
            e["esperando_reenvio"] = True
            salvar_estado(e)
            log("parado: esperando o reenvio dos brutos quebrados")
            progresso(e["atividade"], int(20 + 80 * e.get("feitos", 0) / max(e.get("total", 0) + len(danilo._quebrados), 1)),
                      f"{e.get('feitos', 0)} prontos em Revisar edição. Só falta o reenvio dos vídeos acima; edito sozinho quando chegarem.",
                      "andamento")
        return False
    if e.pop("esperando_reenvio", None):
        salvar_estado(e)
    # Processo do launchd não consegue fazer o Drive baixar (a leitura trava ou
    # dá timeout). A pasta Precisa de edição fica "disponível off-line": o
    # próprio Drive baixa, e o Danilo só pega o bruto que já está no Mac.
    baixados = [b for b in brutos if danilo.no_mac(b)]
    if brutos and not baixados:
        if not e.get("esperando_drive"):
            e["esperando_drive"] = True
            salvar_estado(e)
            log(f"esperando o Google Drive baixar {len(brutos)} bruto(s) (pasta off-line)")
            progresso(e.get("atividade"), None if not e.get("total") else int(20 + 80 * e.get("feitos", 0) / e["total"]),
                      f"Esperando o Google Drive baixar os brutos no Mac ({len(brutos)} na fila). "
                      "Se demorar, confira se o Drive está aberto e se a pasta Precisa de edição está disponível off-line "
                      "(ou mande por AirDrop e arraste para a pasta Para o Danilo, na Mesa).",
                      faltam_videos=e.get("total", 0) - e.get("feitos", 0), espera_min=10)
        return False
    if e.pop("esperando_drive", None):
        salvar_estado(e)
    brutos = baixados + [b for b in brutos if b not in baixados]
    if brutos and not espaco_ok(e, brutos[0]):
        return False
    if not brutos:
        # Só fecha o lote quando todos foram editados de verdade (bruto com erro
        # ou ainda subindo não conta: a tarefa continua em andamento).
        if (e.get("piloto") or e.get("atividade")) and e.get("feitos", 0) >= e.get("total", 0):
            progresso(e.get("atividade"), 100, "Lote editado: todos os vídeos estão em Precisa de você › Revisar edição.",
                      "aguardando_aprovacao")
            salvar_estado({})
            # Todos já aprovados? Conclui aqui (senão, o último "Aprovar" conclui no servidor).
            if e.get("atividade") and not danilo.db("""SELECT 1 FROM public.edicoes_video WHERE atividade_id = %s
                                                         AND status NOT IN ('aprovado', 'cancelado') LIMIT 1""", (e["atividade"],)):
                danilo.db("UPDATE public.atividades SET situacao = 'concluida', concluida = true WHERE id = %s", (e["atividade"],))
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
                      (f"Danilo não conseguiu editar sozinho: {str(erro)[:450]}", r[0][0]))
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
                      f"Agora: {e['feitos']} de {e['total']} prontos em Revisar edição; começando o próximo.",
                      faltam_videos=max(e["total"] - e["feitos"], 0))
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
                                         -- "Começar agora" (▶️, botão da fila do Davi): tenta de novo mesmo se já falhou.
                                         AND (NOT (a2.id = ANY(%s::uuid[])) OR coalesce(a2.observacao, '') LIKE '▶️%%')
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


# Último sinal (16/10): a cada minuto, numa thread própria (o laço principal fica
# preso enquanto o Claude trabalha). A Visão geral mostra "Danilo parado desde
# HH:MM" quando passa de 3 min sem sinal.
_iniciado_em = datetime.now(timezone.utc)


def gravar_sinal():
    while True:
        try:
            danilo.db("""INSERT INTO public.servicos_sinal (user_id, servico, ultimo_sinal, iniciado_em)
                       SELECT user_id, 'danilo', now(), %s FROM public.clientes WHERE id = %s
                       ON CONFLICT (user_id, servico) DO UPDATE
                       SET ultimo_sinal = now(), iniciado_em = EXCLUDED.iniciado_em""", (_iniciado_em, danilo.CLIENTE))
        except Exception as e:  # rede caiu etc.: tenta de novo na próxima volta
            log("sinal: erro —", repr(e)[:200])
        time.sleep(60)


# ---------------------------------------------------------------- editor pela web
def atender_pedido():
    """Pedido feito no navegador (edicoes_pedidos): 'versao' traz o projeto mexido
    → nova versão pelo servidor; 'aprovar' → Full HD, Drive e Dalila. Depois sobe
    a prévia/projeto pra nuvem."""
    linha = danilo.db("""UPDATE public.edicoes_pedidos p SET status = 'fazendo', atualizado_em = now()
                         WHERE p.id = (SELECT id FROM public.edicoes_pedidos WHERE status = 'na_fila'
                                       ORDER BY criado_em LIMIT 1 FOR UPDATE SKIP LOCKED)
                         RETURNING p.id, p.edicao_id, p.tipo, p.projeto""")
    if not linha:
        return False
    pid, eid, tipo, projeto = str(linha[0][0]), str(linha[0][1]), linha[0][2], linha[0][3]
    log("pedido da web:", tipo, eid)
    try:
        if not (danilo.pasta(eid) / "projeto.json").exists():
            raise RuntimeError("a pasta desta edição não está neste Mac")
        if tipo == "versao":
            st, msg = danilo.nova_versao(eid, projeto=projeto if isinstance(projeto, dict) else json.loads(projeto))
        else:
            st, msg = danilo.aprovar_pelo_servidor(eid)
        if st == "erro":
            raise RuntimeError(msg or "o servidor deu erro")
        danilo.sincronizar_nuvem(eid)
        danilo.db("UPDATE public.edicoes_pedidos SET status = 'feito', atualizado_em = now() WHERE id = %s", (pid,))
    except Exception as erro:
        log("pedido falhou:", pid, traceback.format_exc()[-400:])
        danilo.db("UPDATE public.edicoes_pedidos SET status = 'erro', mensagem = %s, atualizado_em = now() WHERE id = %s",
                  (str(erro)[:300], pid))
    return True


def sincronizar():
    """Versão nova feita no Mac (mini editor, chat do Danilo, edição automática)
    que ainda não subiu: sobe o projeto, a prévia e a onda (uma por vez)."""
    for (eid,) in danilo.db("""SELECT id FROM public.edicoes_video
                               WHERE status IN ('revisar', 'aprovado') AND atualizado_em > now() - interval '30 days'
                                 AND (previa_url IS NULL OR previa_url NOT LIKE '%%/previa-v' || versao || '.mp4'
                                      OR projeto_em IS NULL OR projeto_em < atualizado_em)
                               ORDER BY atualizado_em DESC LIMIT 5"""):
        try:
            if danilo.sincronizar_nuvem(str(eid)):
                return True
        except Exception as erro:
            log("nuvem: não subi", eid, str(erro)[:200])
    return False


def laco_web():
    while True:
        try:
            if atender_pedido() or sincronizar():
                continue
        except Exception as erro:
            log("erro no laço da web:", repr(erro)[:300])
            time.sleep(30)
        time.sleep(10)


if __name__ == "__main__":
    if "--uma-vez" in sys.argv:
        danilo.ligar_tarefas()
        while atender_tarefa() or atender_drive():
            pass
        sys.exit(0)
    log("serviço do Danilo iniciado")
    threading.Thread(target=gravar_sinal, daemon=True).start()
    threading.Thread(target=laco_web, daemon=True).start()   # pedidos do editor web não esperam a edição automática
    ultima_drive = 0.0
    while True:
        try:
            danilo.ligar_tarefas()
            danilo.guardar_editados(log)
            if atender_tarefa():
                continue
            if atender_formato():
                continue
            if time.time() - ultima_drive > 60:       # a cada minuto olha as pastas de entrada
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
