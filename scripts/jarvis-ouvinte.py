"""Ouvinte permanente do Jarvis: roda sozinho no Mac (LaunchAgent
com.infoprohub.jarvis-ouvinte, ver scripts/instalar-jarvis-ouvinte.sh) e,
quando chega pedido, chama o Claude Code em segundo plano (`claude -p`) na
pasta do projeto. Substitui as sessões do Claude que precisavam ficar
"ouvindo" (Monitor) e paravam sozinhas.

  - Conversa (⌘J): mensagem nova em jarvis_conversa → o Claude responde
    (inclusive /cobrar e /analisar <id>) com scripts/jarvis-conversa.py.
  - WhatsApp: botão "Atualizar" (whatsapp_painel.atualizacao_status =
    'pedida') → o Claude lê o WhatsApp Web (Claude in Chrome) e publica.
  - Briefing de tarefa: o Davi conversa com um funcionário da empresa
    (briefing_mensagens) → o Claude responde no papel dele
    (scripts/empresa/briefing.py) até o Davi confirmar a tarefa.
  - Execução: tarefa confirmada na fila de um funcionário IA que trabalha
    sozinho (execucao.EXECUTORES, hoje o Ítalo) → o Claude faz e entrega um
    documento para o Davi aprovar (scripts/empresa/execucao.py).

Usa o login do Claude Code feito com `claude auth login` (o plano do Davi,
sem API paga). Log em ~/.infopro-hub/ouvinte/ouvinte.log.

    python3 scripts/jarvis-ouvinte.py          # roda (o LaunchAgent faz isso)
    python3 scripts/jarvis-ouvinte.py --teste  # só confere o Claude e sai
"""
import glob
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402
sys.path.insert(0, str(RAIZ / "scripts" / "empresa"))
import briefing  # noqa: E402
import execucao  # noqa: E402

EMAIL = "eu.daviqueiroz22@gmail.com"  # conta admin do app (src/lib/admin.ts)
PASTA = Path.home() / ".infopro-hub" / "ouvinte"
PASTA.mkdir(parents=True, exist_ok=True)
LOG = PASTA / "ouvinte.log"
PYTHON = sys.executable


def log(*partes):
    linha = f"[{datetime.now():%d/%m %H:%M:%S}] " + " ".join(str(p) for p in partes)
    with open(LOG, "a") as f:
        f.write(linha + "\n")
    print(linha, flush=True)


def claude_bin():
    """O Claude Code que vem com o app do Claude (a pasta muda a cada
    atualização: pega a versão mais nova)."""
    achados = glob.glob(str(Path.home() / "Library/Application Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude"))
    if not achados:
        return None
    def versao(caminho):
        v = Path(caminho).parts[-6]
        return tuple(int(x) if x.isdigit() else 0 for x in v.split("."))
    return max(achados, key=versao)


def rodar_claude(prompt, minutos, chrome=False, sessao=None, info=None):
    """Roda o Claude em segundo plano e devolve (ok, texto do resultado).
    `sessao`: continua essa sessão (--resume). `info` (dict) recebe o
    session_id da execução, pra próxima continuar dela."""
    binario = claude_bin()
    if not binario:
        return False, "Claude Code não encontrado neste Mac (abra o app do Claude uma vez)."
    cmd = [binario, "-p", prompt, "--output-format", "json", "--max-turns", "60",
           # Sem ninguém pra aprovar: libera só o que esses pedidos usam.
           "--allowedTools", "Bash", "Read", "Grep", "Glob", "Edit", "Write", "WebSearch", "WebFetch"]
    if sessao:
        cmd += ["--resume", sessao]
    if chrome:
        # Claude in Chrome (WhatsApp Web): liga e libera as ferramentas dele.
        cmd += ["--chrome", "--allowedTools", "mcp__claude-in-chrome"]
    try:
        r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, timeout=minutos * 60,
                           env={**os.environ, "PATH": f"{Path(PYTHON).parent}:/usr/bin:/bin:/usr/sbin:/sbin"})
    except subprocess.TimeoutExpired:
        return False, f"O Claude passou de {minutos} min e foi interrompido."
    try:
        dados = json.loads(r.stdout)
    except ValueError:
        return False, (r.stderr or r.stdout or "sem resposta").strip()[:300]
    texto = (dados.get("result") or "").strip()
    if info is not None:
        info["session_id"] = dados.get("session_id")
    if dados.get("is_error"):
        if "authenticate" in texto or "OAuth" in texto:
            texto = "O Claude em segundo plano está deslogado. Rode o login de novo (ver scripts/instalar-jarvis-ouvinte.sh)."
        return False, texto[:300]
    return True, texto


# ---------------------------------------------------------------- Conversa

def dono(q):
    q.execute("SELECT id FROM auth.users WHERE lower(email) = %s", (EMAIL,))
    return q.fetchone()[0]


def pegar_mensagens():
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute("""UPDATE public.jarvis_conversa SET status = 'lida'
                     WHERE user_id = %s AND papel = 'davi' AND status = 'enviada'
                     RETURNING id, texto, criada_em""", (uid,))
        novas = sorted(q.fetchall(), key=lambda r: r[2])
        c.commit()
        if not novas:
            return [], []
        # Contexto: as últimas mensagens antes das novas (o Claude começa "frio").
        q.execute("""SELECT papel, texto, criada_em FROM public.jarvis_conversa
                     WHERE user_id = %s AND criada_em < %s ORDER BY criada_em DESC LIMIT 12""", (uid, novas[0][2]))
        historico = list(reversed(q.fetchall()))
        return ([{"id": str(r[0]), "texto": r[1]} for r in novas],
                [{"de": "Davi" if p == "davi" else "Você", "texto": t[:1500], "quando": f"{d:%d/%m %H:%M}"} for p, t, d in historico])
    finally:
        c.close()


def responder_erro(id_msg, motivo):
    subprocess.run([PYTHON, str(RAIZ / "scripts/jarvis-conversa.py"), "responder", id_msg],
                   input=f"⚠️ Não consegui responder agora: {motivo}", text=True, cwd=RAIZ)


def ainda_sem_resposta(ids):
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT id FROM public.jarvis_conversa WHERE id = ANY(%s::uuid[]) AND status <> 'respondida'", (ids,))
        return [str(r[0]) for r in q.fetchall()]
    finally:
        c.close()


PROMPT_CONVERSA = """Você é a "Inteligência do Infopro" respondendo o Davi pela aba Conversa do Jarvis (app Infopro Hub). Ele não está vendo este terminal: só vê o que você gravar com o script abaixo.

Conversa recente (contexto, já respondida):
{historico}

Mensagem(ns) NOVA(S) do Davi, para responder agora:
{novas}

Como responder cada mensagem nova:
- Grave a resposta com:
  python3 scripts/jarvis-conversa.py responder <id> <<'FIM'
  <texto>
  FIM
- Português simples, curto, markdown leve (negrito, listas, `código`).
- "/cobrar": rode `python3 scripts/cobranca-jarvis.py contexto`, publique UMA cobrança (tom pesado, sempre publica) como explicado na memória do projeto (jarvis-conversa-inteligencia) e em scripts/cobranca-jarvis.py, e responda só uma linha curta.
- "/analisar <id>": siga scripts/creator-analise.py (contexto → publicar) como na memória do projeto; responda uma linha curta.
- Texto começando com 'Sobre a cobrança "...": o que está me travando é': responda como coach de execução firme, com o menor próximo passo para começar agora.
- Perguntas sobre o negócio: consulte os dados reais com scripts/consulta.py (somente leitura). Não escreva no banco sem o Davi pedir explicitamente.
- Nunca envie mensagens de WhatsApp nem e-mails.
Responda TODAS as mensagens novas antes de terminar."""


PREFIXO_VOZ = "🎙️"
SESSAO_VOZ = PASTA / "sessao-voz.json"
SESSAO_VOZ_HORAS = 4   # depois disso sem falar, a próxima ordem começa uma sessão nova

PROMPT_VOZ = """O Davi está FALANDO com você pela orbe do Jarvis (segura ⌥+Espaço, fala, solta; o Mac transcreve). É o jeito dele de trabalhar com você no dia a dia, como numa sessão do Claude Code: ele dá ordens ("implementa…", "ajusta…", "vê se…", "como está…") e você executa de verdade neste projeto (Infopro Hub, siga o CLAUDE.md e a memória do projeto), testa e conta o resultado. A transcrição pode ter erros de palavra: interprete pelo sentido.

Fala(s) nova(s) do Davi, para atender agora:
{novas}

Como trabalhar:
- Execute o pedido: leia o código, implemente, rode os testes / `npx tsc` / lint que fizerem sentido e confira o resultado. Se for pergunta sobre o negócio, consulte os dados reais com scripts/consulta.py (somente leitura).
- Se a ordem for ambígua ou arriscada (apagar coisa, mexer em dado real, mandar mensagem pra alguém), NÃO faça: responda perguntando o que ele quer.
- Não reinstale nem feche o app Infopro Hub sem ele pedir (o Jarvis é o próprio app). Nunca envie WhatsApp nem e-mail. Não escreva no banco sem pedido explícito. Sem git push.
- Grave a resposta (uma por fala) com:
  python3 scripts/jarvis-conversa.py responder <id> <<'FIM'
  <texto>
  FIM
- A resposta vai ser LIDA EM VOZ ALTA (só o primeiro parágrafo). Então o PRIMEIRO PARÁGRAFO é o resumo falado: português simples, 1 a 3 frases curtas, sem markdown, sem nome de arquivo, sem código, sem emoji. Diga o que fez e se deu certo, ou o que precisa dele. Depois de uma linha em branco, pode pôr os detalhes escritos (markdown leve) se forem úteis.
Responda TODAS as falas novas antes de terminar."""


def sessao_voz():
    try:
        d = json.loads(SESSAO_VOZ.read_text())
        if time.time() - d.get("quando", 0) < SESSAO_VOZ_HORAS * 3600:
            return d.get("id")
    except (OSError, ValueError):
        pass
    return None


def atender_voz(novas):
    log("voz:", len(novas), "fala(s)")
    prompt = PROMPT_VOZ.format(novas="\n".join(f"- id {m['id']}: {m['texto'][len(PREFIXO_VOZ):].strip()}" for m in novas))
    sessao, info = sessao_voz(), {}
    ok, texto = rodar_claude(prompt, minutos=40, sessao=sessao, info=info)
    if not ok and sessao:   # sessão antiga sumiu/quebrou: começa uma nova
        log("voz: sessão", sessao, "falhou, começando outra —", texto)
        info = {}
        ok, texto = rodar_claude(prompt, minutos=40, info=info)
    if info.get("session_id"):
        SESSAO_VOZ.write_text(json.dumps({"id": info["session_id"], "quando": time.time()}))
    faltam = ainda_sem_resposta([m["id"] for m in novas])
    if not ok:
        log("voz: falhou —", texto)
    for id_msg in faltam:
        responder_erro(id_msg, texto if not ok else "o Claude terminou sem gravar a resposta.")
    log("voz: ok" if ok and not faltam else f"voz: {len(faltam)} sem resposta")


def atender_conversa():
    novas, historico = pegar_mensagens()
    if not novas:
        return
    voz = [m for m in novas if m["texto"].startswith(PREFIXO_VOZ)]
    if voz:
        atender_voz(voz)
        novas = [m for m in novas if not m["texto"].startswith(PREFIXO_VOZ)]
        if not novas:
            return
    log("conversa:", len(novas), "mensagem(ns)")
    prompt = PROMPT_CONVERSA.format(
        historico="\n".join(f"- {h['de']} ({h['quando']}): {h['texto']}" for h in historico) or "(nenhuma)",
        novas="\n".join(f"- id {m['id']}: {m['texto']}" for m in novas),
    )
    ok, texto = rodar_claude(prompt, minutos=15)
    faltam = ainda_sem_resposta([m["id"] for m in novas])
    if not ok:
        log("conversa: falhou —", texto)
    for id_msg in faltam:
        responder_erro(id_msg, texto if not ok else "o Claude terminou sem gravar a resposta.")
    log("conversa: ok" if ok and not faltam else f"conversa: {len(faltam)} sem resposta")


# ---------------------------------------------------------------- WhatsApp

def pegar_pedido_whatsapp():
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.whatsapp_painel p SET atualizacao_status = 'rodando', atualizacao_mensagem = null
                     FROM auth.users u WHERE u.id = p.user_id AND lower(u.email) = %s AND p.atualizacao_status = 'pedida'
                     RETURNING p.atualizacao_pedida_em""", (EMAIL,))
        row = q.fetchone()
        c.commit()
        return row
    finally:
        c.close()


def status_whatsapp():
    c = connect()
    try:
        q = c.cursor()
        q.execute("""SELECT p.atualizacao_status FROM public.whatsapp_painel p JOIN auth.users u ON u.id = p.user_id
                     WHERE lower(u.email) = %s""", (EMAIL,))
        row = q.fetchone()
        return row[0] if row else None
    finally:
        c.close()


PROMPT_WHATSAPP = """O Davi clicou em "Atualizar" na guia WhatsApp do Jarvis. Atualize o painel de respostas aos mentorados, exatamente como descrito na memória do projeto (painel-mentorados-whatsapp, whatsapp-ler-todas-conversas, respostas-mentorados-sanduiche-disc):
1. Leia as conversas DO BANCO: `python3 /Users/davi/Infopro-hub/scripts/whatsapp-ler.py` (todas as conversas com atividade desde a última atualização, privados e grupos, com os áudios já transcritos; use `--chat "nome"` pra ver mais de uma conversa). As mensagens chegam pelo WAHA no Mac, então não precisa abrir o WhatsApp Web.
   Só se a primeira linha disser que o WAHA não está WORKING: aí leia pelo WhatsApp Web no Claude in Chrome, como antes.
2. Atualize /Users/davi/Infopro-hub/.claude/painel/build.py e historico.json, rode `python3 build.py` nessa pasta.
3. Publique com: cd /Users/davi/Infopro-hub/scripts && python3 publicar-painel-whatsapp.py (isso fecha o pedido).
Se não der (ex.: WAHA desconectado e WhatsApp Web deslogado), rode:
  python3 /Users/davi/Infopro-hub/scripts/esperar-pedido-whatsapp.py --erro "<motivo curto>"
Nunca envie mensagens no WhatsApp: só leia."""


def atender_whatsapp():
    if not pegar_pedido_whatsapp():
        return
    log("whatsapp: pedido de atualização")
    # Chrome fica ligado só como reserva (WAHA fora do ar).
    ok, texto = rodar_claude(PROMPT_WHATSAPP, minutos=30, chrome=True)
    final = status_whatsapp()
    if final == "rodando":  # o Claude não fechou o pedido
        motivo = texto if not ok else "a atualização terminou sem publicar o painel."
        subprocess.run([PYTHON, str(RAIZ / "scripts/esperar-pedido-whatsapp.py"), "--erro", motivo[:200]], cwd=RAIZ)
        log("whatsapp: falhou —", motivo)
    else:
        log(f"whatsapp: {final}")


# ---------------------------------------------------------------- Briefing

PROMPT_BRIEFING = """Você é um funcionário da empresa de um projeto no Infopro Hub. O Davi está te passando uma TAREFA por uma conversa no app (clicou em você na Visão geral), como se falasse com a pessoa. Ele não vê este terminal: só vê o que você gravar com os comandos abaixo.

Briefing: {bid}

1. Rode `python3 scripts/empresa/briefing.py contexto {bid}`: projeto, quem você é, seu manual e a conversa até aqui.
2. Leia o seu manual (se tiver) e a sua inteligência com o comando que o contexto mostra (use `--saida` numa pasta temporária se precisar ler os textos). Arquivo anexado pelo Davi (linha com 📎 e "documento <id>"): leia esse documento antes, com `python3 scripts/consulta.py "select titulo, conteudo from documentos where id = '<id>'"`.
3. Seu papel AGORA é ENTENDER a tarefa, não fazer. Responda como a pessoa, em português simples e curto:
   - diga com suas palavras o que entendeu;
   - pergunte só o que falta de verdade (no máximo 3 perguntas, as mais importantes: objetivo, para qual produto/público, formato da entrega, prazo, referências);
   - diga com honestidade se consegue fazer, o que NÃO consegue (ex.: precisa de arquivo, acesso ou decisão do Davi) e o que precisa dele.
   Se o funcionário for PESSOA (o contexto avisa), fale como o assistente que vai repassar para ela: ajude o Davi a deixar o pedido claro e diga o que a pessoa vai precisar.
4. Quando estiver claro (ou o Davi disser que está bom), PRIMEIRO grave a proposta — o resumo que vira a tarefa:
   python3 scripts/empresa/briefing.py propor {bid} <<'FIM'
   {{"titulo": "...", "entendimento": "o que vou fazer, em 2-4 frases", "entregas": ["..."], "consigo": "sim|em_parte|nao", "limites": "o que não consigo / riscos", "precisa_de": ["o que preciso do Davi"], "prazo_sugerido": "AAAA-MM-DD", "tipo": "copy|pagina|quiz|carrossel|estudo|edicao|programacao|metricas|gravacao"}}
   FIM
   e termine a resposta com: "Se estiver certo, clique em **Confirmar e subir a tarefa**." Se o Davi corrigir algo depois, grave a proposta de novo.
5. Por último, grave a resposta (é ela que avisa o app que você terminou):
   python3 scripts/empresa/briefing.py responder {bid} <<'FIM'
   <texto>
   FIM
6. Aprendizado (vale para TODOS os funcionários): se o Davi te corrigir ou disser como gosta ou não gosta das coisas, e isso valer para as próximas vezes (não só esta tarefa), anote em 1 frase curta e geral:
   python3 scripts/inteligencia/aprender.py anotar --cliente <cliente_id> --agente "<seu nome>" "<a regra>"
   Os aprendizados aparecem no topo do ler.py ("SIGA SEMPRE"): siga sempre.
Regras: não comece a tarefa, não crie atividade, não publique nem envie nada, não escreva no banco fora desses comandos (o aprender.py é permitido). Dados do negócio só com scripts/consulta.py (somente leitura). Hoje é {hoje}."""


PROMPT_REVISAO = """Você é um funcionário da empresa de um projeto no Infopro Hub. Você ENTREGOU um documento e o Davi está lendo e conversando com você sobre ele no app (a tela "Ver e aprovar"), como num chat. Ele não vê este terminal: só vê o que você gravar com os comandos abaixo. Não existe botão de refazer: é pela conversa que VOCÊ entende se é elogio, ajuste pontual ou refazer.

Conversa: {bid}

Ao vivo: o Davi vê no chat o que você está fazendo. A cada passo, avise em poucas palavras (minúsculas, sem ponto final):
   python3 scripts/empresa/briefing.py agora {bid} "lendo o documento"
1. Rode `python3 scripts/empresa/briefing.py contexto {bid}`: projeto, quem você é, a tarefa, o documento entregue e a conversa até aqui.
2. Leia o documento entregue (o comando está no contexto), o seu manual e a sua inteligência (ler.py, os "SIGA SEMPRE" do topo).
3. Entenda a ÚLTIMA mensagem do Davi (com o resto da conversa) e aja:
   - ELOGIO / "gostei", "pode usar": agradeça em 1 frase, diga o que vai manter e POR QUÊ funciona; anote como reforço para as próximas vezes, ex.: "Manter: nomes que falam da dor do público, como Mapa da Dispersão":
     python3 scripts/inteligencia/aprender.py anotar --cliente <cliente_id> --agente "<seu nome>" "<a regra>"
     Não mexa no documento.
   - AJUSTE (mudar, trocar, tirar, acrescentar algo) ou REFAZER (ele não gostou do todo, quer outro caminho): se está claro, FAÇA AGORA no mesmo documento. O Davi vê o documento mudando na tela: entregue POR PARTES, uma seção pronta de cada vez (cada entregar leva o documento INTEIRO com as partes já mudadas), avisando antes com "agora" (ex.: "reescrevendo as chamadas"):
     python3 scripts/empresa/execucao.py entregar <atividade_id> "<título>" "<resumo de 1 linha do que mudou>" <<'FIM'
     <html completo do documento: h2, h3, p, ul, ol, li, strong, em, a, blockquote>
     FIM
     Mude só o que ele pediu; o que ele elogiou fica. Refazer do zero: siga o seu manual e a conversa, pesquisando o que precisar. Na resposta, diga em poucas linhas o que mudou.
     Se NÃO está claro o que ele quer (ou a mudança é grande e há caminhos bem diferentes), pergunte antes (no máximo 2 perguntas) e não mexa.
   - Pergunta ou comentário: responda direto, citando o documento.
   Correção que vale para as próximas vezes: anote também (aprender.py).
4. Por último, grave a resposta (é ela que avisa o app que você terminou):
   python3 scripts/empresa/briefing.py responder {bid} <<'FIM'
   <texto curto, como num chat>
   FIM
Regras: não publique, não poste e não envie nada em nome do Davi; não escreva no banco fora desses comandos; não aprove a tarefa (quem aprova é o Davi). Hoje é {hoje}."""


# Cada conversa no seu próprio fio (15/10: a revisão longa do Roy travava a
# resposta do Gabriel). Mensagem nova numa conversa que já está sendo atendida
# espera ela terminar.
MAX_CONVERSAS = 4
_conversas = set()
_trava_conversas = threading.Lock()


def _atender_briefing(bid):
    try:
        log("briefing:", bid)
        modelo = PROMPT_REVISAO if briefing.status(bid) == "revisando" else PROMPT_BRIEFING
        ok, texto = rodar_claude(modelo.format(bid=bid, hoje=f"{datetime.now():%d/%m/%Y}"), minutos=40 if modelo is PROMPT_REVISAO else 12)
        if briefing.sem_resposta(bid):
            motivo = texto if not ok else "terminei sem gravar a resposta."
            briefing.responder(bid, f"⚠️ Não consegui responder agora: {motivo[:200]}")
            log("briefing: falhou —", bid, motivo)
        else:
            log("briefing: ok", bid)
    except Exception as e:  # rede caiu etc.
        log("briefing: erro —", bid, repr(e)[:300])
    finally:
        with _trava_conversas:
            _conversas.discard(bid)


def atender_briefings():
    with _trava_conversas:
        ocupadas = set(_conversas)
    if len(ocupadas) >= MAX_CONVERSAS:
        return
    for bid in briefing.pegar(ignorar=ocupadas):
        with _trava_conversas:
            _conversas.add(bid)
        threading.Thread(target=_atender_briefing, args=(bid,), daemon=True).start()


# ---------------------------------------------------------------- Execução

PROMPT_EXECUCAO = """Você é um funcionário IA da empresa de um projeto no Infopro Hub (siga o CLAUDE.md e a memória do projeto). O Davi conversou com você, você disse o que entendeu, e ele CONFIRMOU a tarefa. Agora é para FAZER, sozinho, e entregar para ele revisar. Ele não vê este terminal.

Tarefa: {aid}

1. Rode `python3 scripts/empresa/execucao.py contexto {aid}`: o combinado, o prazo, o projeto e onde está o seu manual.
2. Leia o seu manual inteiro e a sua inteligência (`ler.py` com `--saida` numa pasta temporária, e leia os textos que importam para esta tarefa). Leia também os documentos do projeto que o combinado citar (scripts/consulta.py, somente leitura; o conteúdo é HTML). Arquivo anexado pelo Davi (linha com 📎 e "documento <id>"): leia esse documento antes, com `python3 scripts/consulta.py "select titulo, conteudo from documentos where id = '<id>'"`. Se o contexto avisar que é um AJUSTE, refaça em cima da versão anterior só o que o Davi pediu.
Progresso (o Davi acompanha numa barra): ao terminar cada etapa, informe quanto do trabalho TODO já está feito e o que vem agora, por exemplo 15 depois de ler o contexto e o manual, 35 depois da pesquisa/leitura, 60 com o rascunho pronto, 85 revisando:
   python3 scripts/empresa/execucao.py progresso {aid} <0-100> "<o que está fazendo agora, curto>"
3. Faça o trabalho de verdade, como combinado. Pesquisa na internet: WebSearch/WebFetch; comentários e vídeos do YouTube: yt-dlp (`PYTHONPATH=~/.infopro-hub/ytdlp SSL_CERT_FILE=~/.infopro-hub/py/certifi/cacert.pem python3 -m yt_dlp --skip-download --write-comments --write-info-json ...`), trabalhe numa pasta temporária. Cite só o que você realmente leu; frases do público, do jeito que escreveram; nunca invente dado, depoimento ou número. Se algo combinado não deu para fazer, diga no documento (seção "Limites desta versão").
4. Entregue UM documento organizado (HTML simples: h2, h3, p, ul, ol, li, strong, em, a, blockquote):
   python3 scripts/empresa/execucao.py entregar {aid} "<título do documento>" "<resumo de 1 linha do que entregou>" <<'FIM'
   <html>
   FIM
   Isso cria o documento no projeto e manda a tarefa para a aprovação do Davi.
   Se o contexto mostrar ETAPAS (ex.: QUIZ, docs/QUIZ.md), faça só a etapa indicada e entregue do jeito que ela manda (no quiz, a etapa 2 salva com scripts/quiz/quiz.py, não com o entregar).
5. Se não for possível fazer (falta arquivo, acesso ou decisão do Davi), não entregue pela metade sem avisar: rode
   python3 scripts/empresa/execucao.py erro {aid} "<o que falta, em 1 frase>"
6. Aprendizado (vale para TODOS os funcionários): se o Davi te corrigir ou disser como gosta ou não gosta das coisas, e isso valer para as próximas vezes (não só esta tarefa), anote em 1 frase curta e geral:
   python3 scripts/inteligencia/aprender.py anotar --cliente <cliente_id> --agente "<seu nome>" "<a regra>"
   Os aprendizados aparecem no topo do ler.py ("SIGA SEMPRE"): siga sempre. O combinado da tarefa e as correções do Davi na conversa contam.
Regras: não publique, não poste, não comente e não envie nada em nome do Davi; não escreva no banco fora desses comandos (o aprender.py é permitido); sem git. Hoje é {hoje}."""

_tentadas = set()


def atender_execucao():
    aid = execucao.pegar(ignorar=_tentadas)
    if not aid:
        return
    _tentadas.add(aid)  # uma tentativa por tarefa enquanto o ouvinte estiver de pé
    log("execução:", aid)
    ok, texto = rodar_claude(PROMPT_EXECUCAO.format(aid=aid, hoje=f"{datetime.now():%d/%m/%Y %H:%M}"), minutos=50)
    if execucao.situacao(aid) == "andamento":  # o Claude não entregou nem avisou
        execucao.erro(aid, texto[:200] if not ok else "terminei sem entregar o documento.")
        log("execução: falhou —", texto[:200])
    else:
        _tentadas.discard(aid)  # entregou: se o Davi pedir ajuste, a tarefa volta pra fila e pode ser refeita
        log("execução:", execucao.situacao(aid))


# ---------------------------------------------------------------- laço

def laco(nome, funcao, intervalo):
    while True:
        try:
            funcao()
        except Exception as e:  # rede caiu etc.: tenta de novo
            log(f"{nome}: erro —", repr(e)[:300])
            time.sleep(15)
        time.sleep(intervalo)


if __name__ == "__main__":
    if "--teste" in sys.argv:
        print("claude:", claude_bin())
        print(rodar_claude("Responda apenas: OK", minutos=2))
        sys.exit(0)
    log("ouvinte iniciado; claude =", claude_bin())
    try:
        n = briefing.reenfileirar()
        if n:
            log(f"briefing: {n} mensagem(ns) de atendimento interrompido de volta na fila")
    except Exception as e:
        log("briefing: não reenfileirei —", repr(e)[:200])
    # Conversa e WhatsApp em paralelo: uma atualização longa do WhatsApp não
    # trava a Conversa.
    threading.Thread(target=laco, args=("whatsapp", atender_whatsapp, 5), daemon=True).start()
    threading.Thread(target=laco, args=("briefing", atender_briefings, 3), daemon=True).start()
    threading.Thread(target=laco, args=("execucao", atender_execucao, 10), daemon=True).start()
    laco("conversa", atender_conversa, 3)
