"""Ouvinte permanente do Atlas: roda sozinho no Mac (LaunchAgent
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
  - Melhorias: o que o Davi libera no kanban do Pedro, ele implementa; e, das
    8h às 22h, a cada 30 min, o Pedro busca até 5 ideias novas sozinho
    (rodada, scripts/pedro/melhorias.py).
  - Cobrança: das 8h às 22h, a cada 30 min, o Claude escolhe a cobrança do
    Atlas (scripts/cobranca_rodada.py + scripts/cobranca-jarvis.py).

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
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
# Os serviços do Roy e do Danilo carregam este arquivo dentro do processo deles, que
# está de pé há horas: o migration_db que eles importaram pode ser velho (16/10: o Roy
# parou com "cannot import name 'eh_falha_de_conexao'"). Recarrega antes de importar.
if "migration_db" in sys.modules:
    import importlib  # noqa: E402
    importlib.reload(sys.modules["migration_db"])
from migration_db import connect, eh_falha_de_conexao, reusar_nesta_thread  # noqa: E402
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


def rodar_claude(prompt, minutos, chrome=False, sessao=None, info=None, cwd=None, turnos=60, ferramentas=None):
    """Roda o Claude em segundo plano e devolve (ok, texto do resultado).
    `sessao`: continua essa sessão (--resume). `info` (dict) recebe o
    session_id da execução, pra próxima continuar dela. `ferramentas`: troca
    a lista liberada (ex.: só leitura)."""
    binario = claude_bin()
    if not binario:
        return False, "Claude Code não encontrado neste Mac (abra o app do Claude uma vez)."
    cmd = [binario, "-p", prompt, "--output-format", "json", "--max-turns", str(turnos),
           # Sem ninguém pra aprovar: libera só o que esses pedidos usam.
           "--allowedTools", *(ferramentas or ["Bash", "Read", "Grep", "Glob", "Edit", "Write", "WebSearch", "WebFetch"])]
    if sessao:
        cmd += ["--resume", sessao]
    if chrome:
        # Claude in Chrome (WhatsApp Web): liga e libera as ferramentas dele.
        cmd += ["--chrome", "--allowedTools", "mcp__claude-in-chrome"]
    return rodar_claude_com(cmd, minutos, cwd, info)


def rodar_claude_com(cmd, minutos, cwd=None, info=None):
    """Roda o comando do Claude já montado e devolve (ok, texto)."""
    try:
        r = subprocess.run(cmd, cwd=cwd or RAIZ, capture_output=True, text=True, timeout=minutos * 60,
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
    if dados.get("is_error") and "safeguards" in texto and "--model" not in cmd:
        # 18/10: o filtro do Opus barrou por engano o roteiro do Junior ("This sometimes happens with
        # safe, normal conversations... can't respond with Opus"). Tenta de novo com o Sonnet.
        log("claude: filtro do Opus barrou; tentando com o Sonnet")
        return rodar_claude_com(cmd + ["--model", "sonnet"], minutos, cwd, info)
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


PROMPT_CONVERSA = """Você é a "Inteligência do Infopro" respondendo o Davi pela aba Conversa do Atlas (app Infopro Hub). Ele não está vendo este terminal: só vê o que você gravar com o script abaixo.

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

PROMPT_VOZ = """O Davi está FALANDO com você pela orbe do Atlas (segura ⌥+Espaço, fala, solta; o Mac transcreve). É o jeito dele de trabalhar com você no dia a dia, como numa sessão do Claude Code: ele dá ordens ("implementa…", "ajusta…", "vê se…", "como está…") e você executa de verdade neste projeto (Infopro Hub, siga o CLAUDE.md e a memória do projeto), testa e conta o resultado. A transcrição pode ter erros de palavra: interprete pelo sentido.

Fala(s) nova(s) do Davi, para atender agora:
{novas}

Como trabalhar:
- Execute o pedido: leia o código, implemente, rode os testes / `npx tsc` / lint que fizerem sentido e confira o resultado. Se for pergunta sobre o negócio, consulte os dados reais com scripts/consulta.py (somente leitura).
- Se a ordem for ambígua ou arriscada (apagar coisa, mexer em dado real, mandar mensagem pra alguém), NÃO faça: responda perguntando o que ele quer.
- Não reinstale nem feche o app Infopro Hub sem ele pedir (o Atlas é o próprio app). Nunca envie WhatsApp nem e-mail. Não escreva no banco sem pedido explícito. Sem git push.
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


def pedir_whatsapp_apos_resposta():
    """19/10/2026 (Davi): "no momento que eu respondo, já entender que não é mais 24 horas, se fiz alguma
    tarefa, se não fiz, como fui". O Davi mandou mensagem no WhatsApp (pelo app ou pelo celular) depois da
    última leitura e parou há 3 min: pede a atualização do painel sozinho (no máximo uma a cada 10 min)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.whatsapp_painel p
                        SET atualizacao_pedida_em = now(), atualizacao_status = 'pedida', atualizacao_mensagem = null
                       FROM auth.users u
                      WHERE u.id = p.user_id AND lower(u.email) = %s
                        AND coalesce(p.atualizacao_status, 'ok') NOT IN ('pedida', 'rodando')
                        AND coalesce(p.atualizacao_pedida_em, 'epoch') < now() - interval '10 minutes'
                        AND EXISTS (SELECT 1 FROM public.whatsapp_mensagens m
                                     WHERE m.user_id = p.user_id AND m.de_mim AND m.chat_nome IS DISTINCT FROM 'Meus arquivos'
                                       AND m.enviada_em > greatest(coalesce(p.atualizado_em, 'epoch'), coalesce(p.atualizacao_pedida_em, 'epoch')))
                        AND NOT EXISTS (SELECT 1 FROM public.whatsapp_mensagens m
                                         WHERE m.user_id = p.user_id AND m.de_mim AND m.enviada_em > now() - interval '3 minutes')
                  RETURNING 1""", (EMAIL,))
        row = q.fetchone()
        c.commit()
        if row:
            log("whatsapp: o Davi respondeu alguém; pedi a atualização do painel")
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


PROMPT_WHATSAPP = """O Davi clicou em "Atualizar" na guia WhatsApp do Atlas (ou o pedido veio sozinho porque ele acabou de responder alguém no WhatsApp). Atualize o painel de respostas aos mentorados, exatamente como descrito na memória do projeto (painel-mentorados-whatsapp, whatsapp-ler-todas-conversas, respostas-mentorados-sanduiche-disc):
1. Leia as conversas DO BANCO: `python3 /Users/davi/Infopro-hub/scripts/whatsapp-ler.py` (todas as conversas com atividade desde a última atualização, privados e grupos, com os áudios já transcritos; use `--chat "nome"` pra ver mais de uma conversa). As mensagens chegam pelo WAHA no Mac, então não precisa abrir o WhatsApp Web.
   Só se a primeira linha disser que o WAHA não está WORKING: aí leia pelo WhatsApp Web no Claude in Chrome, como antes.
2. Atualize /Users/davi/Infopro-hub/.claude/painel/build.py e historico.json, rode `python3 build.py` nessa pasta.
3. Publique com: cd /Users/davi/Infopro-hub/scripts && python3 publicar-painel-whatsapp.py (isso fecha o pedido).
Se não der (ex.: WAHA desconectado e WhatsApp Web deslogado), rode:
  python3 /Users/davi/Infopro-hub/scripts/esperar-pedido-whatsapp.py --erro "<motivo curto>"
Nas conversas que o Davi respondeu desde a última leitura, deixe tudo em dia: a interação vira respondida (sai do "precisa responder" e do "+24h"), a promessa que ele cumpriu vira cumprida (e a que ele fez de novo entra como aberta), e entra a avaliação da resposta dele (acolheu, solução, próximos passos, junto, DISC) com a reação da pessoa, se já houver.
Registre também o que ELES ficaram de entregar ao Davi (roteiros, gravações, fotos, acessos, respostas, pagamentos…) em historico.json > "entregas": [{"mentorado": "<id>", "o_que": "...", "desde": "AAAA-MM-DDTHH:MM", "prazo": "AAAA-MM-DD" ou null, "status": "aguardando" | "entregue", "cobrado_em": quando o Davi cobrou por último, "entregue_em": quando chegou}]. Na 1ª vez que a lista não existir, monte com as últimas 2 semanas de conversa.
Regra do Davi: quem cobra é ele, nunca o especialista. Entrega vencida (passou o prazo, ou 3 dias sem prazo e sem cobrança) vira card em "Responder agora" com a cobrança pronta (sanduíche + DISC da pessoa, leve e com data nova). Quando o Davi cobrar, atualize "cobrado_em"; quando entregarem, "entregue".
Nunca envie mensagens no WhatsApp: só leia."""


def atender_whatsapp():
    pedir_whatsapp_apos_resposta()
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
   Precisa de um colega (ex.: copy/nomes com o Ítalo, visual com o Roy)? Chame-o para ESTA conversa, em vez de mandar o Davi abrir outra:
   python3 scripts/empresa/briefing.py convidar {bid} "<nome>"   (ele responde logo depois de você; diga isso na sua resposta)
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
   O app mostra ao lado há quanto tempo você está nisso. Antes de todo passo demorado (gerar versão de vídeo, pesquisar, reescrever uma parte grande), avise com "agora" dizendo qual é, ex.: "gerando a versão 7 do vídeo", "ajustando a pergunta 3 do quiz (1 de 2)". Assim ele não acha que você travou.
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
   - Se o contexto disser que é EDIÇÃO DE VÍDEO, QUIZ ou CARROSSEL, mude do jeito que ele indica (não com o entregar).
   - Se o contexto disser que é CONVERSA SOBRE UMA MELHORIA (Pedro), não há documento: converse sobre as pendências e siga o que o contexto indica (melhorias.py retomar quando ele resolver).
   - Pergunta ou comentário: responda direto, citando o documento.
   Correção que vale para as próximas vezes: anote também (aprender.py).
   Precisa de um colega (ex.: copy/nomes com o Ítalo, visual com o Roy)? Chame-o para ESTA conversa, em vez de mandar o Davi abrir outra:
   python3 scripts/empresa/briefing.py convidar {bid} "<nome>"   (ele responde logo depois de você; diga isso na sua resposta)
4. Por último, grave a resposta (é ela que avisa o app que você terminou):
   python3 scripts/empresa/briefing.py responder {bid} <<'FIM'
   <texto curto, como num chat>
   FIM
   Se o Davi pediu mais de uma coisa, faça TODAS antes de responder. Se alguma ficou de fora (ex.: precisa dele, ou não deu), escreva na resposta o que JÁ fez e o que FALTA, com o motivo: ele não pode ficar achando que o resto ainda está vindo.
Regras: não publique, não poste e não envie nada em nome do Davi; não escreva no banco fora desses comandos; não aprove a tarefa (quem aprova é o Davi). Hoje é {hoje}."""


# Cada conversa no seu próprio fio (15/10: a revisão longa do Roy travava a
# resposta do Gabriel). Mensagem nova numa conversa que já está sendo atendida
# espera ela terminar.
MAX_CONVERSAS = 4
_conversas = set()
_trava_conversas = threading.Lock()


PROMPT_PARTICIPANTE = """Você é {nome}, funcionário IA da empresa de um projeto no Infopro Hub. O Davi (ou um colega) te CHAMOU para uma conversa em grupo no app: a conversa é de outro funcionário, e o Davi quer ver o que cada um pensa. Ele não vê este terminal.

Conversa: {bid}

1. Rode `python3 scripts/empresa/briefing.py contexto {bid} --como "{nome}"`: quem você é, de quem é a conversa, quem mais está nela e o que já foi dito.
2. Leia o seu manual e a sua inteligência (ler.py, os "SIGA SEMPRE" do topo) e o que a conversa citar (documento entregue, anexos 📎, com scripts/consulta.py).
3. Responda à ÚLTIMA mensagem do Davi PELA SUA ÁREA (ex.: o copywriter fala de copy, nomes, promessa; quem faz o design fala de visual), em português simples e curto, como num chat. Se o colega já disse o que você diria, concorde em 1 frase e acrescente só o que falta. Proponha concreto (ex.: os 4 nomes prontos), não "posso ajudar".
   Não mexa nos entregáveis do colega: quem aplica é o dono da conversa, que lê a sua resposta.
   Se o Davi te corrigir algo que vale para as próximas vezes, anote (python3 scripts/inteligencia/aprender.py anotar --cliente <cliente_id> --agente "{nome_min}" "<a regra>").
4. Grave a sua fala:
   python3 scripts/empresa/briefing.py responder {bid} --como "{nome}" <<'FIM'
   <texto>
   FIM
Regras: não publique, não poste e não envie nada em nome do Davi; não escreva no banco fora desses comandos; sem git. Hoje é {hoje}."""


def _falar_como(bid, nome):
    desde = datetime.now(timezone.utc)
    ok, texto = rodar_claude(PROMPT_PARTICIPANTE.format(bid=bid, nome=nome, nome_min=nome.lower(), hoje=f"{datetime.now():%d/%m/%Y}"), minutos=15)
    if not briefing.respondeu(bid, nome, desde):
        log("briefing: participante não respondeu —", bid, nome, (texto or "")[:150])


def _atender_briefing(bid):
    try:
        log("briefing:", bid)
        modelo = PROMPT_REVISAO if briefing.status(bid) == "revisando" else PROMPT_BRIEFING
        # Conversa em grupo (15/10): quem já está nela fala primeiro (cada um pela sua área),
        # o dono responde por último e aplica; quem ele chamar fala logo depois.
        antes = briefing.participantes(bid)
        for _, nome in antes:
            _falar_como(bid, nome)
        desde = datetime.now(timezone.utc)
        ok, texto = rodar_claude(modelo.format(bid=bid, hoje=f"{datetime.now():%d/%m/%Y}"), minutos=40 if modelo is PROMPT_REVISAO else 12)
        if not briefing.respondeu(bid, None, desde):
            motivo = texto if not ok else "terminei sem gravar a resposta."
            briefing.responder(bid, f"⚠️ Não consegui responder agora: {motivo[:200]}")
            log("briefing: falhou —", bid, motivo)
        else:
            log("briefing: ok", bid)
        ja = {i for i, _ in antes}
        novos = [(i, n) for i, n in briefing.participantes(bid) if i not in ja]
        for _, nome in novos:
            _falar_como(bid, nome)
        if antes or novos:
            briefing.finalizar(bid)
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
   python3 scripts/empresa/execucao.py progresso {aid} <0-100> "<o que está fazendo agora, curto>" <minutos que você acha que ainda faltam>
   (o Davi vê "faltam ~X min": seja realista e ajuste a cada etapa)
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
# Em paralelo (16/10, Davi: "subiu atividade, o funcionário não pode ficar parado
# esperando"): cada funcionário faz uma tarefa por vez, mas ninguém espera o colega.
MAX_EXECUCOES = 4
_trabalhando = {}            # tarefa -> funcionário
_trava_execucoes = threading.Lock()


PROMPT_SISTEMA = """Você é um funcionário IA da empresa de um projeto no Infopro Hub. O Davi te passou uma tarefa que MUDA O PRÓPRIO SISTEMA (o Infopro Hub: telas, banco, scripts, a sua rotina). Você vai IMPLEMENTAR sozinho, agora, e entregar para ele aprovar. Ele não vê este terminal.

Tarefa: {aid}
Você está num worktree só desta tarefa: {obra} (ramo {ramo}). Trabalhe SÓ aqui (não mexa em {raiz}); o ouvinte junta no sistema quando você terminar.

1. `python3 scripts/empresa/execucao.py contexto {aid}` (o combinado, quem você é, seu manual), o CLAUDE.md, a memória do projeto e o seu manual em docs/agentes/ (se tiver).
   Progresso (o Davi acompanha numa barra), a cada etapa:
   python3 scripts/empresa/execucao.py progresso {aid} <0-100> "<o que está fazendo, curto>" <minutos que ainda faltam>
2. Planeje a menor mudança que resolve o combinado. Implemente seguindo o jeito do código ao redor, em português. Banco só por migração em supabase/migrations (confira o número em supabase_migrations.schema_migrations, vários chats migram em paralelo) + teste em supabase/tests + script apply (rode --testar antes e depois aplique). Edge function: pode publicar (npx supabase@latest functions deploy …) se o combinado pedir.
3. Confira: `npx tsc --noEmit -p tsconfig.app.json` (sem erros NOVOS), `npx eslint` nos arquivos mudados, `node --test tests/*.test.mjs`.
4. Commit no ramo (git add só dos seus arquivos; mensagem em português "feat:"/"fix:", terminando com "Co-Authored-By: <seu nome> (IA do Infopro) <noreply@anthropic.com>").
5. Entregue um BRIEFING pro Davi (português simples, sem jargão), com as seções: O que mudou / Onde fica no app / Como usar / O que testar agora / Limites e próximos passos:
   python3 scripts/empresa/execucao.py entregar {aid} "<título>" "<resumo de 1 linha>" <<'FIM'
   <html: h2, h3, p, ul, ol, li, strong, em>
   FIM
   Se depender do Davi (chave, login, decisão) ou não for possível: faça o que dá, commit, e rode
   python3 scripts/empresa/execucao.py erro {aid} "<o que falta, em 1 frase>"
Regras: sem git push, não reinicie serviços nem reinstale o app (diga no briefing se precisar), não publique posts nem mande mensagens. Hoje é {hoje}."""

OBRAS_TAREFAS = Path.home() / ".infopro-hub" / "obras"


def _executar_sistema(aid):
    """Tarefa que muda o sistema: worktree próprio, como as melhorias do Pedro; junta no main ao entregar."""
    curto = aid[:8]
    ramo, obra = f"tarefa/{curto}", OBRAS_TAREFAS / curto
    OBRAS_TAREFAS.mkdir(parents=True, exist_ok=True)
    if obra.exists():
        _git("worktree", "remove", "--force", str(obra))
    if _git("rev-parse", "--verify", "--quiet", ramo).returncode == 0:
        r = _git("worktree", "add", str(obra), ramo)
    else:
        r = _git("worktree", "add", "-b", ramo, str(obra), "main")
    if r.returncode != 0:
        execucao.erro(aid, f"Não consegui preparar a cópia do código: {(r.stderr or r.stdout).strip()[:200]}")
        return
    for nome in ("node_modules", ".env", ".env.local", ".env.migration.local"):
        if (RAIZ / nome).exists() and not (obra / nome).exists():
            (obra / nome).symlink_to(RAIZ / nome)
    ok, texto = rodar_claude(PROMPT_SISTEMA.format(aid=aid, obra=obra, ramo=ramo, raiz=RAIZ, hoje=f"{datetime.now():%d/%m/%Y %H:%M}"),
                             minutos=90, cwd=obra, turnos=200)
    st = execucao.situacao(aid)
    novos = _git("rev-list", "--count", f"main..{ramo}").stdout.strip()
    if st == "andamento":
        execucao.erro(aid, texto[:200] if not ok else "terminei sem entregar.")
    elif st == "aguardando_aprovacao" and novos not in ("", "0"):
        m = _git("merge", "--no-edit", ramo)
        if m.returncode != 0:
            _git("merge", "--abort")
            # Já entregue (aguardando aprovação): o erro() não muda nada; avisa na tarefa e no log (16/10:
            # o "Reels em Programados" da Dalila ficou parado no ramo sem ninguém saber).
            execucao.nota(aid, f"⚠️ Pronto no ramo {ramo}, mas não deu para juntar no sistema (conflito com trabalho de outro chat). "
                               f"Peça ao chat geral para juntar. {(m.stderr or m.stdout).strip()[:150]}")
            log("execução: merge falhou —", ramo, (m.stderr or m.stdout).strip()[:200])
            _git("worktree", "remove", "--force", str(obra))
            return                                  # mantém o ramo
        log("execução: juntei no main", ramo)
    _git("worktree", "remove", "--force", str(obra))
    if execucao.situacao(aid) == "aguardando_aprovacao":
        _git("branch", "-D", ramo)


def _executar(aid):
    try:
        log("execução:", aid)
        if execucao.eh_sistema(aid):
            _executar_sistema(aid)
            if execucao.situacao(aid) not in ("andamento", "fila"):   # erro volta pra fila: não tenta de novo sozinho
                _tentadas.discard(aid)
            log("execução:", aid, execucao.situacao(aid))
            return
        ok, texto = rodar_claude(PROMPT_EXECUCAO.format(aid=aid, hoje=f"{datetime.now():%d/%m/%Y %H:%M}"), minutos=50)
        if execucao.situacao(aid) == "andamento":  # o Claude não entregou nem avisou
            execucao.erro(aid, texto[:200] if not ok else "terminei sem entregar o documento.")
            log("execução: falhou —", aid, texto[:200])
        else:
            _tentadas.discard(aid)  # entregou: se o Davi pedir ajuste, a tarefa volta pra fila e pode ser refeita
            log("execução:", aid, execucao.situacao(aid))
    except Exception as e:  # rede caiu etc.
        log("execução: erro —", aid, repr(e)[:300])
    finally:
        with _trava_execucoes:
            _trabalhando.pop(aid, None)


def atender_execucao():
    while True:
        with _trava_execucoes:
            if len(_trabalhando) >= MAX_EXECUCOES:
                return
            ocupados = list(_trabalhando.values())
        aid, membro = execucao.pegar(ignorar=_tentadas, ocupados=ocupados, com_membro=True, sistema=True)
        if not aid:
            return
        _tentadas.add(aid)  # uma tentativa por tarefa enquanto o ouvinte estiver de pé
        with _trava_execucoes:
            _trabalhando[aid] = membro
        threading.Thread(target=_executar, args=(aid,), daemon=True).start()


# ---------------------------------------------------------------- Melhorias (Pedro)

# O que o Davi arrasta pra "Pode fazer" no kanban do Pedro, ele implementa
# sozinho (15/10/2026: "pode dar essa liberdade para ele"). Cada cartão vira um
# worktree/ramo próprio; com o "pronto" do Pedro, o ouvinte junta no main.
sys.path.insert(0, str(RAIZ / "scripts" / "pedro"))
import melhorias  # noqa: E402
import esteira  # noqa: E402  (esteira de produção por escritório, 17/10)
import vigia  # noqa: E402  (trabalho travado: recomeça sozinho; se não der, avisa o Davi — 17/10)

OBRAS = Path.home() / ".infopro-hub" / "pedro" / "obras"

PROMPT_MELHORIA = """Você é o Pedro, IA de melhorias do Infopro Hub. O Davi aprovou (arrastou para "Pode fazer") uma melhoria do sistema e você vai IMPLEMENTAR sozinho, agora. Ele não vê este terminal.

Melhoria: {mid}
Você está num worktree só desta melhoria: {obra} (ramo {ramo}). Trabalhe SÓ aqui (não mexa em {raiz}).

1. `python3 scripts/pedro/melhorias.py contexto {mid}` e leia docs/agentes/pedro-melhorias.md (regras), o CLAUDE.md e a memória do projeto.
2. Planeje a menor mudança que resolve. Avise o andamento a cada etapa:
   python3 scripts/pedro/melhorias.py progresso {mid} <0-100> "<o que está fazendo, curto>"
3. Implemente. Banco só por migração + teste em supabase/tests + script apply (rode --testar antes e depois aplique). Siga o jeito do código ao redor, em português.
4. Confira: `npx tsc --noEmit -p tsconfig.app.json` (sem erros NOVOS em relação ao começo), `npx eslint` nos arquivos que mudou, `node --test tests/*.test.mjs`.
5. Commit no ramo (git add só dos seus arquivos; mensagem em português começando com "feat:" ou "fix:" e terminando com a linha "Co-Authored-By: Pedro (IA do Infopro) <noreply@anthropic.com>").
6. Por último, entregue com um BRIEFING pro Davi (ele lê no seu kanban e não pode ficar perdido). Português simples, sem jargão de programador, com estas seções:
   O que mudou (em 2-3 frases, o antes → depois)
   Onde fica no app (caminho de cliques: "Projetos → Davi Queiroz → Conteúdo → …")
   Como usar (passo a passo numerado)
   O que testar agora (2-4 conferências rápidas que ele faz em 1 minuto)
   Limites e próximos passos (o que ficou de fora, se precisa reiniciar algo)
   python3 scripts/pedro/melhorias.py pronto {mid} "<resumo de 1 linha>" <<'FIM'
   <o briefing, com as seções acima>
   FIM
   Se DEPENDE DO DAVI (uma chave/senha que só ele cria, um login, uma decisão, um arquivo, uma conta): faça tudo o que dá antes, faça commit do que já fez no ramo e pare com a lista do que ele precisa fazer (vai pra coluna Pendências com um check pra cada item; ele conversa com você por lá):
   python3 scripts/pedro/melhorias.py pendente {mid} "<por que parou, simples>" <<'FIM'
   ["<o que ele precisa fazer, passo claro>", "..."]
   FIM
   Se não der por outro motivo (é área de outro chat — Roy/Danilo/Dalila —, ou é grande demais): python3 scripts/pedro/melhorias.py erro {mid} "<por quê, simples>"
Regras: sem git push, sem merge (o ouvinte junta), não reinstale o app, não reinicie o ouvinte, não envie WhatsApp/e-mail, não publique nada. Hoje é {hoje}."""


def _git(*args, cwd=RAIZ):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)


def atender_melhorias():
    mid = melhorias.pegar()
    if not mid:
        return
    curto = mid[:8]
    ramo, obra = f"pedro/{curto}", OBRAS / curto
    log("melhoria:", mid)
    OBRAS.mkdir(parents=True, exist_ok=True)
    if obra.exists():
        _git("worktree", "remove", "--force", str(obra))
    # Voltou de uma pendência: continua do ramo dele (o que já tinha feito fica).
    if _git("rev-parse", "--verify", "--quiet", ramo).returncode == 0:
        r = _git("worktree", "add", str(obra), ramo)
    else:
        r = _git("worktree", "add", "-b", ramo, str(obra), "main")
    if r.returncode != 0:
        melhorias.erro(mid, f"Não consegui preparar a cópia do código: {(r.stderr or r.stdout).strip()[:200]}")
        return
    # O worktree usa os mesmos pacotes e as mesmas chaves locais do projeto.
    for nome in ("node_modules", ".env", ".env.local", ".env.migration.local"):
        if (RAIZ / nome).exists() and not (obra / nome).exists():
            (obra / nome).symlink_to(RAIZ / nome)
    ok, texto = rodar_claude(PROMPT_MELHORIA.format(mid=mid, obra=obra, ramo=ramo, raiz=RAIZ, hoje=f"{datetime.now():%d/%m/%Y %H:%M}"),
                             minutos=90, cwd=obra, turnos=200)
    st, resultado, _ = melhorias.situacao(mid) or (None, None, None)
    if st == "pendente":                       # depende do Davi: guarda o ramo pra continuar depois
        log("melhoria: pendente —", (resultado or "")[:150])
        _git("-C", str(obra), "add", "-A")
        _git("-C", str(obra), "commit", "-q", "-m", "wip: Pedro parou numa pendência (continua depois)")
        _git("worktree", "remove", "--force", str(obra))
        return
    if st != "fazendo":                        # o Pedro registrou erro
        log("melhoria:", st, (resultado or "")[:150])
    elif not resultado:                        # terminou sem "pronto"
        melhorias.erro(mid, f"O Pedro parou sem terminar: {(texto or '')[:300]}")
        log("melhoria: sem pronto —", (texto or "")[:200])
    else:
        novos = _git("rev-list", "--count", f"main..{ramo}").stdout.strip()
        if novos in ("", "0"):
            melhorias.erro(mid, "O Pedro disse que terminou, mas não fez commit de nada.")
        else:
            m = _git("merge", "--no-edit", ramo)
            if m.returncode != 0:
                _git("merge", "--abort")
                melhorias.erro(mid, f"Ficou pronto no ramo {ramo}, mas não deu para juntar no sistema agora "
                                    f"(conflito com trabalho em andamento de outro chat). Peça ao chat geral para juntar. {(m.stderr or m.stdout).strip()[:200]}")
                log("melhoria: merge falhou —", (m.stderr or m.stdout)[:200])
                return                          # mantém o ramo pra juntar depois
            melhorias.feito(mid, _git("rev-parse", "--short", "HEAD").stdout.strip())
            log("melhoria: feita", mid)
    _git("worktree", "remove", "--force", str(obra))
    if melhorias.situacao(mid)[0] == "feito":
        _git("branch", "-D", ramo)


# Rodada de ideias (pedido do Davi, 16/10/2026: "sempre fique trazendo ideias do
# que melhorar"): das 8h às 22h, a cada 30 min, o Pedro olha logs, dados e telas
# e grava até 5 ideias novas no kanban (selo NOVO). Horário, intervalo e prompt
# ficam em melhorias.py (recarregado sozinho). Só leitura: sem Edit/Write.
def rodada_melhorias():
    if not melhorias.rodada_devida():
        return
    melhorias.marcar_rodada()
    log("rodada de ideias: começando")
    ok, texto = rodar_claude(melhorias.prompt_rodada(), minutos=25, turnos=80,
                             ferramentas=["Bash", "Read", "Grep", "Glob"])
    log("rodada de ideias:", f"{melhorias.contar_novas()} nova(s)" if ok else "falhou —", (texto or "")[:200])


# Cobrança do Atlas (melhoria do Pedro, 16/10/2026): saiu da tarefa agendada do
# app do Claude (só rodava com o app aberto e parou em 09/10). Horário,
# intervalo e prompt ficam em cobranca_rodada.py (recarregado sozinho). Cada
# rodada grava o resultado em servicos_sinal ('cobranca').
import cobranca_rodada  # noqa: E402


def rodada_cobranca():
    if not cobranca_rodada.devida():
        return
    cobranca_rodada.marcar()
    ok, texto = rodar_claude(cobranca_rodada.prompt(), minutos=10, turnos=30, ferramentas=["Bash", "Read"])
    linha = (texto or "").strip().splitlines()[-1:] or [""]
    titulo = cobranca_rodada.publicada_desde()
    if titulo:
        detalhe = f"publicou: {titulo}"
    elif not ok:
        detalhe = f"falhou: {(texto or '')[:200]}"
    else:
        detalhe = f"manteve: {linha[0][:200]}"
    cobranca_rodada.registrar(detalhe)
    log("cobrança:", detalhe)


# ---------------------------------------------------------------- laço

# Os módulos dos fluxos (briefing, execução, melhorias) são recarregados a cada
# 30 s: mudança no código deles vale sem reiniciar o ouvinte (16/10).
_recarregado = [time.time()]
_trava_recarga = threading.Lock()


def recarregar_modulos():
    import importlib
    with _trava_recarga:
        if time.time() - _recarregado[0] < 30:
            return
        _recarregado[0] = time.time()
        for m in (briefing, execucao, melhorias, cobranca_rodada, esteira, vigia):
            try:
                importlib.reload(m)
            except Exception as e:  # código com erro: segue com a versão anterior
                log("recarregar:", m.__name__, repr(e)[:200])


# Último sinal (16/10): a cada minuto, numa thread própria (os outros laços
# ficam presos enquanto o Claude trabalha). A Visão geral mostra "equipe sem
# conexão desde HH:MM" quando passa de 3 min sem sinal.
_iniciado_em = datetime.now(timezone.utc)


def gravar_sinal():
    c = connect()
    try:
        q = c.cursor()
        q.execute("""INSERT INTO public.servicos_sinal (user_id, servico, ultimo_sinal, iniciado_em)
                     VALUES (%s, 'ouvinte', now(), %s)
                     ON CONFLICT (user_id, servico) DO UPDATE
                     SET ultimo_sinal = now(), iniciado_em = EXCLUDED.iniciado_em""", (dono(q), _iniciado_em))
        c.commit()
    finally:
        c.close()


# Banco fora (16/10): uma linha "sem banco desde HH:MM" e outra "voltou", em
# vez de uma por laço a cada 15 s (eram 350 linhas numa queda de 30 min).
_banco = {"fora_desde": None}
_trava_banco = threading.Lock()


def _banco_caiu(nome, e):
    with _trava_banco:
        if _banco["fora_desde"]:
            return
        _banco["fora_desde"] = datetime.now()
    log(f"sem banco desde {datetime.now():%H:%M} ({nome}) —", repr(e)[:200])


def _banco_ok():
    with _trava_banco:
        desde, _banco["fora_desde"] = _banco["fora_desde"], None
    if desde:
        minutos = round((datetime.now() - desde).total_seconds() / 60)
        log(f"banco voltou às {datetime.now():%H:%M} (fora desde {desde:%H:%M}, ~{minutos} min)")


def _descartar_conexao_da_thread():
    """Joga fora a conexão reaproveitada desta thread (a próxima volta abre uma nova)."""
    import migration_db
    real = getattr(migration_db._local, 'conexao', None)
    migration_db._local.conexao = None
    migration_db._local.em_uso = False
    if real is not None:
        try:
            real.close()
        except Exception:
            pass


def _reiniciar_se_preso():
    """18/10: das 01:16 às 13:45 o ouvinte ficou com o banco caindo a cada volta (só ele: um
    processo novo conectava normal) e nenhuma tarefa rodou. Banco "fora" há mais de 20 min
    seguidos e ninguém trabalhando: sai, e o launchd (KeepAlive) sobe um ouvinte novo."""
    desde = _banco["fora_desde"]
    if not desde or (datetime.now() - desde).total_seconds() < 20 * 60:
        return
    if subprocess.run(['pgrep', '-f', 'claude -p'], capture_output=True).returncode == 0:
        return   # alguém trabalhando: espera terminar
    log(f"banco preso desde {desde:%H:%M}: reiniciando o ouvinte")
    os._exit(1)


def laco(nome, funcao, intervalo):
    reusar_nesta_thread()   # uma conexão por laço, reaberta só quando cai (migration_db)
    falhas = 0
    while True:
        try:
            recarregar_modulos()
            funcao()
            _banco_ok()
            falhas = 0
        except Exception as e:  # rede caiu etc.: tenta de novo
            if eh_falha_de_conexao(e):
                _banco_caiu(nome, e)
                falhas += 1
                if falhas >= 2:   # caiu duas vezes seguidas: não confia mais na conexão guardada
                    _descartar_conexao_da_thread()
                _reiniciar_se_preso()
            else:
                log(f"{nome}: erro —", repr(e)[:300])
            time.sleep(15)
        time.sleep(intervalo)


if __name__ == "__main__":
    if "--teste" in sys.argv:
        print("claude:", claude_bin())
        print(rodar_claude("Responda apenas: OK", minutos=2))
        sys.exit(0)
    log("ouvinte iniciado; claude =", claude_bin())
    for nome_fluxo, fn, texto in (("briefing", briefing.reenfileirar, "mensagem(ns) de atendimento interrompido"),
                                  ("execucao", execucao.reenfileirar, "tarefa(s) interrompida(s)"),
                                  ("melhorias", melhorias.reenfileirar, "melhoria(s) interrompida(s)")):
        try:
            n = fn()
            if n:
                log(f"{nome_fluxo}: {n} {texto} de volta na fila")
        except Exception as e:
            log(f"{nome_fluxo}: não reenfileirei —", repr(e)[:200])
    # Conversa e WhatsApp em paralelo: uma atualização longa do WhatsApp não
    # trava a Conversa.
    threading.Thread(target=laco, args=("sinal", gravar_sinal, 60), daemon=True).start()
    threading.Thread(target=laco, args=("whatsapp", atender_whatsapp, 5), daemon=True).start()
    threading.Thread(target=laco, args=("briefing", atender_briefings, 3), daemon=True).start()
    threading.Thread(target=laco, args=("execucao", atender_execucao, 10), daemon=True).start()
    threading.Thread(target=laco, args=("melhorias", atender_melhorias, 20), daemon=True).start()
    # Esteira (17/10): peça na fila de uma etapa vira tarefa de quem é a vez; a execução pega.
    threading.Thread(target=laco, args=("esteira", lambda: esteira.andar(), 60), daemon=True).start()
    def _vigiar():
        for linha in vigia.rodar():
            log("vigia:", linha)
    threading.Thread(target=laco, args=("vigia", _vigiar, 300), daemon=True).start()
    threading.Thread(target=laco, args=("rodada", rodada_melhorias, 60), daemon=True).start()
    threading.Thread(target=laco, args=("cobranca", rodada_cobranca, 60), daemon=True).start()
    laco("conversa", atender_conversa, 3)
