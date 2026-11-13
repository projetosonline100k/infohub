"""Agente automático do X1 (13/11/2026, Davi: "o Abordar é tudo automático: já vai mandando, o cliente vai respondendo e a Gabriela vai respondendo também").

Roda no Mac (o WAHA do WhatsApp do projeto está aqui), dentro do ouvinte "só código". A cada poucos segundos (`passada`):
  1. conversa em `abordar` (o Davi clicou em Abordar): o agente escreve a mensagem de abertura para aquele lead e manda pelo WhatsApp do projeto;
  2. conversa em `conversando`: o que o lead escreveu depois do cursor (tabela whatsapp_mensagens, alimentada pelo receptor) é respondido com a
     inteligência do agente (mesmo prompt do teste, scripts/agente_whatsapp.py), uma mensagem de cada vez, com "digitando…" entre elas.
Para sozinho (e avisa na tela) quando: a inteligência manda chamar uma pessoa ([CHAMAR_HUMANO]), o Davi escreve por conta própria no chat (assumiu),
o lead vira "convertido", passa do limite de mensagens, ou o WhatsApp falha. Nunca manda de madrugada (23h às 7h de Brasília: espera amanhecer).
O interruptor geral é agentes_whatsapp.automatico (botão na tela do X1)."""
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402
import agente_whatsapp  # noqa: E402

DEBOUNCE_S = 12            # espera o lead terminar de digitar (várias mensagens seguidas viram uma resposta só)
MAX_ENVIADAS = 80          # por lead: passou disso, passa para uma pessoa
MAX_POR_HORA = 14          # por conversa
HORA_INICIO, HORA_FIM = 7, 23   # horário de Brasília em que o robô escreve
BRT = timezone(timedelta(hours=-3))
_SEP = re.compile(r"\n\s*-{3,}\s*\n")


def normalizar(t):
    return re.sub(r"[^a-z0-9]+", " ", re.sub(r"[̀-ͯ]", "", __import__("unicodedata").normalize("NFD", (t or "").lower()))).strip()


def no_horario(agora=None):
    h = (agora or datetime.now(timezone.utc)).astimezone(BRT).hour
    return HORA_INICIO <= h < HORA_FIM


def e_do_robo(texto, enviados_recentes):
    """A mensagem que saiu do número foi o robô que mandou? (se não foi, o Davi assumiu a conversa)"""
    n = normalizar(texto)
    return not n or any(n == e or n in e or e in n for e in enviados_recentes if e)


def partes_da_resposta(texto):
    return [p.strip() for p in _SEP.split((texto or "").strip()) if p.strip()]


def historico_do_chat(msgs, limite=30):
    """msgs: [(de_mim, texto)] em ordem. Devolve o formato do agente: [{papel, texto}]."""
    return [{"papel": "agente" if de_mim else "lead", "texto": t} for de_mim, t in msgs if t][-limite:]


def waha_config(conta):
    pasta = ".infopro-hub/whatsapp" if conta in (None, "", "principal") else f".infopro-hub/whatsapp-{re.sub(r'[^a-zA-Z0-9]', '', conta)}"
    return json.loads((Path.home() / pasta / "config.json").read_text())


def waha_post(cfg, caminho, corpo):
    req = urllib.request.Request(cfg.get("waha_url", "http://localhost:3000") + caminho, data=json.dumps(corpo).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Api-Key": cfg["waha_api_key"]})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read() or b"{}")


def resolver_chat(conta, telefone_wa):
    """Confere no WhatsApp se o número existe e devolve o id certo do chat (pn@c.us). Número BR muda: o 9º dígito de alguns DDDs não existe no WhatsApp
    (91981999578 vira 559181999578@c.us), e mandar para o id errado dá erro 500. None se o número não tem WhatsApp."""
    cfg = waha_config(conta)
    sessao = cfg.get("sessao", "default")
    req = urllib.request.Request(f"{cfg.get('waha_url', 'http://localhost:3000')}/api/contacts/check-exists?phone={telefone_wa}&session={sessao}", headers={"X-Api-Key": cfg["waha_api_key"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read() or b"{}")
    if not d.get("numberExists"):
        return None
    return d.get("pn") or d.get("chatId")


def enviar_partes(conta, chat_id, partes, log):
    """Manda cada parte como uma mensagem, com 'digitando…' proporcional ao tamanho (como uma pessoa)."""
    cfg = waha_config(conta)
    sessao = cfg.get("sessao", "default")
    for i, texto in enumerate(partes):
        try:
            waha_post(cfg, "/api/startTyping", {"session": sessao, "chatId": chat_id})
        except Exception:  # noqa: BLE001  digitando é enfeite
            pass
        time.sleep(min(7.0, 1.2 + len(texto) * 0.035))
        waha_post(cfg, "/api/sendText", {"session": sessao, "chatId": chat_id, "text": texto})
        try:
            waha_post(cfg, "/api/stopTyping", {"session": sessao, "chatId": chat_id})
        except Exception:  # noqa: BLE001
            pass
        if i < len(partes) - 1:
            time.sleep(1.0 + min(3.0, len(partes[i + 1]) * 0.02))


def telefone_chat(whatsapp):
    d = re.sub(r"\D", "", whatsapp or "")
    if not d:
        return None
    if len(d) <= 11:
        d = "55" + d
    return f"{d}@c.us"


def _atualizar(q, id_, **campos):
    sets = ", ".join(f"{k} = %s" for k in campos)
    q.execute(f"UPDATE public.x1_agente_conversas SET {sets}, trava_ate = NULL, atualizado_em = now() WHERE id = %s", (*campos.values(), id_))


def _contexto_lead(q, resp_id):
    q.execute("SELECT nome, perfil, respostas, status, whatsapp, email FROM public.quiz_respostas WHERE id = %s", (resp_id,))
    r = q.fetchone()
    if not r:
        return None
    resps = [f"{x.get('pergunta')} → {x.get('resposta')}" for x in (r[2] or []) if x.get("resposta")][:40]
    q.execute("SELECT count(*) FROM public.quiz_eventos e JOIN public.quiz_respostas r ON r.sessao = e.sessao WHERE r.id = %s AND e.tipo = 'cta'", (resp_id,))
    cta = (q.fetchone() or [0])[0] > 0
    return {"nome": r[0], "perfil": r[1], "respostas": resps, "foi_ao_checkout": cta, "status": r[3], "whatsapp": r[4]}


def _escrever(rodar_claude, log, conversa, config, lead, historico, mensagem, abertura):
    p = {"id": conversa["id"], "tipo": "simular", "mensagem": mensagem, "historico": historico, "config_atual": config, "cliente_id": str(conversa["cliente_id"]),
         "contexto": {"origem": "x1", "iniciar": abertura, "quiz_id": str(conversa["quiz_id"]), "lead": lead}}
    alvo = None if abertura else agente_whatsapp._alvo(p)
    ok, texto = rodar_claude(agente_whatsapp._prompt(p, alvo), minutos=4, turnos=3, ferramentas=["Read"])
    if not ok or not texto.strip():
        return None
    if alvo:
        texto = agente_whatsapp.ajustar_quantidade(texto, alvo)
    return texto.strip()


def passada(rodar_claude, log=print):
    c = connect()
    try:
        q = c.cursor()
        q.execute("""SELECT c.id, c.quiz_id, c.resposta_id, c.cliente_id, c.chat_id, c.conta, c.estado, c.enviadas, c.recebidas, c.cursor_em, c.enviados_recentes, c.ultima_acao_em
                     FROM public.x1_agente_conversas c LEFT JOIN public.agentes_whatsapp a ON a.cliente_id = c.cliente_id
                     WHERE c.estado IN ('abordar', 'conversando') AND (c.trava_ate IS NULL OR c.trava_ate < now()) AND COALESCE(a.automatico, true)
                     ORDER BY c.atualizado_em LIMIT 5""")
        cols = ["id", "quiz_id", "resposta_id", "cliente_id", "chat_id", "conta", "estado", "enviadas", "recebidas", "cursor_em", "enviados_recentes", "ultima_acao_em"]
        conversas = [dict(zip(cols, r)) for r in q.fetchall()]
        c.commit()
        for cv in conversas:
            try:
                _tratar(c, q, rodar_claude, log, cv)
            except Exception as e:  # noqa: BLE001
                c.rollback()
                log("agente X1: erro", str(cv["id"])[:8], repr(e)[:200])
                _atualizar(q, cv["id"], estado="erro", motivo=f"Erro: {e}"[:300])
                c.commit()
    finally:
        c.close()


def _tratar(c, q, rodar_claude, log, cv):
    q.execute("UPDATE public.x1_agente_conversas SET trava_ate = now() + interval '6 minutes' WHERE id = %s", (cv["id"],))
    c.commit()
    q.execute("SELECT config FROM public.agentes_whatsapp WHERE cliente_id = %s", (cv["cliente_id"],))
    config = (q.fetchone() or [{}])[0] or {}
    lead = _contexto_lead(q, cv["resposta_id"])
    if not lead:
        _atualizar(q, cv["id"], estado="encerrado", motivo="Lead não existe mais"); c.commit(); return
    if lead["status"] == "convertido":
        _atualizar(q, cv["id"], estado="encerrado", motivo="Lead convertido"); c.commit(); return
    q.execute("SELECT whatsapp_conta FROM public.clientes WHERE id = %s", (cv["cliente_id"],))
    conta = (q.fetchone() or [None])[0] or cv["conta"] or "principal"
    chat_id = cv["chat_id"]
    if not chat_id:
        bruto = telefone_chat(lead["whatsapp"])
        if not bruto:
            _atualizar(q, cv["id"], estado="erro", motivo="Esse lead não tem um WhatsApp válido"); c.commit(); return
        chat_id = resolver_chat(conta, bruto.split("@")[0])
        if not chat_id:
            _atualizar(q, cv["id"], estado="erro", motivo="Esse número não tem WhatsApp"); c.commit(); return
        q.execute("UPDATE public.x1_agente_conversas SET chat_id = %s WHERE id = %s", (chat_id, cv["id"])); c.commit()
    if not no_horario():   # de madrugada o robô espera: solta a trava e volta na próxima passada
        q.execute("UPDATE public.x1_agente_conversas SET trava_ate = now() + interval '10 minutes' WHERE id = %s", (cv["id"],)); c.commit(); return
    if cv["enviadas"] >= MAX_ENVIADAS:
        _atualizar(q, cv["id"], estado="aguardando_humano", motivo=f"Passou de {MAX_ENVIADAS} mensagens: assuma a conversa"); c.commit(); return

    if cv["estado"] == "abordar":
        log("agente X1: abordando", str(cv["resposta_id"])[:8])
        texto = _escrever(rodar_claude, log, cv, config, lead, [], "", True)
        if not texto:
            _atualizar(q, cv["id"], estado="erro", motivo="O agente não conseguiu escrever agora"); c.commit(); return
        partes = partes_da_resposta(re.sub(r"^\[CHAMAR_HUMANO\]\s*", "", texto))
        enviar_partes(conta, chat_id, partes, log)
        _registrar(q, cv, partes, "Agente")
        _atualizar(q, cv["id"], estado="conversando", chat_id=chat_id, conta=conta, enviadas=cv["enviadas"] + len(partes), cursor_em=datetime.now(timezone.utc),
                   enviados_recentes=[normalizar(p) for p in partes][-20:], ultima_acao_em=datetime.now(timezone.utc), motivo=None)
        q.execute("UPDATE public.quiz_respostas SET status = 'em_contato' WHERE id = %s AND status = 'novo'", (cv["resposta_id"],))
        c.commit()
        return

    # conversando: o que o lead escreveu depois do cursor
    cursor = cv["cursor_em"] or datetime.now(timezone.utc)
    q.execute("""SELECT id, de_mim, COALESCE(NULLIF(btrim(texto), ''), NULLIF(btrim(transcricao), ''), CASE WHEN midia_tipo IS NOT NULL THEN '[' || midia_tipo || ']' END), COALESCE(enviada_em, recebida_em)
                 FROM public.whatsapp_mensagens WHERE conta = %s AND chat_id = %s AND COALESCE(enviada_em, recebida_em) > %s::timestamptz - interval '2 days' ORDER BY COALESCE(enviada_em, recebida_em)""", (conta, chat_id, cursor))
    todas = q.fetchall()
    novas_lead = [m for m in todas if not m[1] and m[2] and m[3] > cursor]
    proprias_novas = [m for m in todas if m[1] and m[2] and m[3] > cursor]
    # O Davi escreveu por conta própria no chat? Então ele assumiu: o robô sai de cena.
    if any(not e_do_robo(m[2], cv["enviados_recentes"] or []) for m in proprias_novas):
        _atualizar(q, cv["id"], estado="pausado", motivo="Você escreveu na conversa: o agente parou (clique em Retomar para ele voltar)"); c.commit(); return
    if not novas_lead:
        q.execute("UPDATE public.x1_agente_conversas SET trava_ate = NULL WHERE id = %s", (cv["id"],)); c.commit(); return
    ultimo_lead = max(m[3] for m in novas_lead)
    if (datetime.now(timezone.utc) - ultimo_lead).total_seconds() < DEBOUNCE_S:   # ainda digitando
        q.execute("UPDATE public.x1_agente_conversas SET trava_ate = NULL WHERE id = %s", (cv["id"],)); c.commit(); return
    q.execute("SELECT count(*) FROM public.quiz_abordagens WHERE resposta_id = %s AND modelo = 'Agente' AND enviada_em > now() - interval '1 hour'", (cv["resposta_id"],))
    if (q.fetchone() or [0])[0] >= MAX_POR_HORA:
        _atualizar(q, cv["id"], estado="aguardando_humano", motivo="Conversa muito acelerada: confira antes de o agente continuar"); c.commit(); return

    antes = historico_do_chat([(m[1], m[2]) for m in todas if m[3] <= cursor])
    mensagem = "\n".join(m[2] for m in novas_lead)
    log("agente X1: respondendo", str(cv["resposta_id"])[:8], f"({len(novas_lead)} mensagem(ns) do lead)")
    texto = _escrever(rodar_claude, log, cv, config, lead, antes, mensagem, False)
    if not texto:
        _atualizar(q, cv["id"], estado="erro", motivo="O agente não conseguiu responder agora"); c.commit(); return
    if texto.lstrip().startswith("[CHAMAR_HUMANO]"):
        _atualizar(q, cv["id"], estado="aguardando_humano", motivo=re.sub(r"^\[CHAMAR_HUMANO\]\s*", "", texto)[:300] or "O agente pediu uma pessoa",
                   cursor_em=ultimo_lead, recebidas=cv["recebidas"] + len(novas_lead)); c.commit()
        log("agente X1: chamou uma pessoa", str(cv["resposta_id"])[:8]); return
    partes = partes_da_resposta(texto)
    enviar_partes(conta, chat_id, partes, log)
    _registrar(q, cv, partes, "Agente")
    _atualizar(q, cv["id"], cursor_em=ultimo_lead, enviadas=cv["enviadas"] + len(partes), recebidas=cv["recebidas"] + len(novas_lead),
               enviados_recentes=(list(cv["enviados_recentes"] or []) + [normalizar(p) for p in partes])[-20:], ultima_acao_em=datetime.now(timezone.utc))
    c.commit()


def _registrar(q, cv, partes, modelo):
    for p in partes:
        q.execute("INSERT INTO public.quiz_abordagens (quiz_id, resposta_id, cliente_id, texto, modelo) VALUES (%s, %s, %s, %s, %s)", (cv["quiz_id"], cv["resposta_id"], cv["cliente_id"], p[:4000], modelo))


def reenfileirar():
    """No início do ouvinte: conversa que ficou travada no meio volta para ser olhada."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.x1_agente_conversas SET trava_ate = NULL WHERE trava_ate IS NOT NULL AND estado IN ('abordar', 'conversando')")
        n = q.rowcount
        c.commit()
        return n
    finally:
        c.close()
