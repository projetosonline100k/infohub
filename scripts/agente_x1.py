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


COMPORTAMENTO_PADRAO = {"separar": True, "pausa": True, "pausa_min_s": 1.5, "pausa_max_s": 7, "ms_por_letra": 40}


def pausa_digitando(texto, comportamento=None):
    """Segundos de "digitando…" antes de uma mensagem: mesma conta do app (src/lib/agenteWhatsapp.ts, pausaDigitando)."""
    c = {**COMPORTAMENTO_PADRAO, **{k: v for k, v in (comportamento or {}).items() if v is not None}}
    if not c["pausa"]:
        return 0.0
    pmin = float(c["pausa_min_s"])
    return min(max(pmin, float(c["pausa_max_s"])), max(pmin, 1.2 + len(texto) * float(c["ms_por_letra"]) / 1000))


def repetida(texto, ja_enviadas):
    """Já mandei isso (ou quase, ou com o nome do lead na frente) nas últimas mensagens do chat?"""
    return any(agente_whatsapp._parecidas(texto, e) for e in ja_enviadas if e)


def enviar_partes(conta, chat_id, partes, log, comportamento=None, recentes=None, parar=None, dormir=time.sleep, post=None):
    """Manda cada parte como uma mensagem, com "digitando…" pelo comportamento da inteligência. Devolve as partes que saíram de fato.
    Guarda final, imediatamente antes de CADA envio: `recentes()` traz o que o agente já mandou nesse chat e a parte repetida não vai;
    `parar()` (chegou mensagem nova do lead) interrompe o resto, que será refeito com o histórico atualizado."""
    cfg = waha_config(conta) if post is None else {}
    sessao = cfg.get("sessao", "default")
    post = post or (lambda caminho, corpo: waha_post(cfg, caminho, corpo))
    enviadas = []
    for texto in partes:
        if parar and parar():
            log("agente X1: chegou mensagem nova do lead, parei o envio")
            break
        try:
            post("/api/startTyping", {"session": sessao, "chatId": chat_id})
        except Exception:  # noqa: BLE001  digitando é enfeite
            pass
        dormir(pausa_digitando(texto, comportamento))
        if parar and parar():
            log("agente X1: chegou mensagem nova do lead, parei o envio")
            break
        if repetida(texto, list(recentes() if recentes else []) + enviadas):
            log("agente X1: mensagem repetida, não enviei")
            continue
        post("/api/sendText", {"session": sessao, "chatId": chat_id, "text": texto})
        enviadas.append(texto)
        try:
            post("/api/stopTyping", {"session": sessao, "chatId": chat_id})
        except Exception:  # noqa: BLE001
            pass
    return enviadas


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


PEDIDO_RACIOCINIO = """

PAINEL DO DAVI (ele acompanha o seu raciocínio ao lado do chat; o lead NUNCA vê isto): DEPOIS das mensagens, escreva uma linha com exatamente [[RACIOCINIO]] e, embaixo, de 3 a 5 tópicos curtos ("- ...") em português: o que o lead disse e o que ele quer de verdade; em que etapa do caminho da conversa vocês estão; qual regra, objeção ou trecho da inteligência você usou; por que escreveu essas mensagens (e não outras); o que fará se ele reagir de certa forma. Não repita as mensagens. Se for [CHAMAR_HUMANO], explique o motivo aqui também."""


def separar_raciocinio(texto):
    """(mensagens, raciocínio): o que vem depois de [[RACIOCINIO]] é só para o painel do Davi e nunca vai ao lead."""
    partes = re.split(r"\n?\s*\[\[RACIOCINIO\]\]\s*", (texto or "").strip(), maxsplit=1)
    return partes[0].strip(), (partes[1].strip() if len(partes) > 1 else "")


def _gravar_raciocinio(q, cv, lead_disse, partes):
    r = (cv.get("_raciocinio") or "").strip()
    if not r:
        return
    q.execute("""INSERT INTO public.x1_agente_raciocinio (conversa_id, resposta_id, cliente_id, lead_disse, raciocinio, mensagens)
                 VALUES (%s, %s, %s, %s, %s, %s)""", (cv["id"], cv["resposta_id"], cv["cliente_id"], (lead_disse or "")[:2000] or None, r[:4000], [p[:2000] for p in partes]))


def _escrever(rodar_claude, log, conversa, config, lead, historico, mensagem, abertura):
    p = {"id": conversa["id"], "tipo": "simular", "mensagem": mensagem, "historico": historico, "config_atual": config, "cliente_id": str(conversa["cliente_id"]),
         "contexto": {"origem": "x1", "iniciar": abertura, "quiz_id": str(conversa["quiz_id"]), "lead": lead}}
    alvo = None if abertura else agente_whatsapp._alvo(p)
    ok, texto = rodar_claude(agente_whatsapp._prompt(p, alvo) + PEDIDO_RACIOCINIO, minutos=4, turnos=3, ferramentas=["Read"])
    if not ok or not texto.strip():
        return None
    texto, conversa["_raciocinio"] = separar_raciocinio(texto)
    if not texto:
        return None
    if alvo:
        texto = agente_whatsapp.ajustar_quantidade(texto, alvo, agente_whatsapp._ultima_do_agente(historico))
    return texto.strip()


def passada(rodar_claude, log=print):
    c = connect()
    try:
        q = c.cursor()
        q.execute("""SELECT c.id, c.quiz_id, c.resposta_id, c.cliente_id, c.chat_id, c.conta, c.estado, c.enviadas, c.recebidas, c.cursor_em, c.enviados_recentes, c.ultima_acao_em, c.recomecou_em
                     FROM public.x1_agente_conversas c LEFT JOIN public.agentes_whatsapp a ON a.cliente_id = c.cliente_id
                     WHERE c.estado IN ('abordar', 'conversando') AND (c.trava_ate IS NULL OR c.trava_ate < now()) AND COALESCE(a.automatico, true)
                     ORDER BY c.atualizado_em LIMIT 5""")
        cols = ["id", "quiz_id", "resposta_id", "cliente_id", "chat_id", "conta", "estado", "enviadas", "recebidas", "cursor_em", "enviados_recentes", "ultima_acao_em", "recomecou_em"]
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


def _pegar_trava(q, cv):
    """Trava atômica: só segue quem conseguiu mudar a trava. Relê os campos da conversa (outra passada pode ter acabado de mexer)."""
    q.execute("""UPDATE public.x1_agente_conversas SET trava_ate = now() + interval '6 minutes'
                 WHERE id = %s AND estado IN ('abordar', 'conversando') AND (trava_ate IS NULL OR trava_ate < now())
                 RETURNING estado, chat_id, enviadas, recebidas, cursor_em, enviados_recentes, recomecou_em""", (cv["id"],))
    r = q.fetchone()
    if not r:
        return False
    cv.update(dict(zip(["estado", "chat_id", "enviadas", "recebidas", "cursor_em", "enviados_recentes", "recomecou_em"], r)))
    return True


def _recentes_do_agente(q, conta, chat_id, cv):
    """O que o agente realmente mandou nesse chat (banco do WhatsApp + o que o próprio agente anotou)."""
    q.execute("""SELECT texto FROM public.whatsapp_mensagens WHERE conta = %s AND chat_id = %s AND de_mim AND texto IS NOT NULL
                 ORDER BY COALESCE(enviada_em, recebida_em) DESC LIMIT 15""", (conta, chat_id))
    return [r[0] for r in q.fetchall()] + list(cv["enviados_recentes"] or [])


def _lead_depois(q, conta, chat_id, depois_de):
    q.execute("""SELECT count(*) FROM public.whatsapp_mensagens WHERE conta = %s AND chat_id = %s AND NOT de_mim
                 AND COALESCE(enviada_em, recebida_em) > %s::timestamptz""", (conta, chat_id, depois_de))
    return (q.fetchone() or [0])[0] > 0


def _tratar(c, q, rodar_claude, log, cv):
    if not _pegar_trava(q, cv):   # outra passada/processo já está com esta conversa
        c.commit(); return
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
        partes = enviar_partes(conta, chat_id, partes, log, config.get("comportamento"), lambda: _recentes_do_agente(q, conta, chat_id, cv))
        _registrar(q, cv, partes, "Agente")
        _gravar_raciocinio(q, cv, None, partes)
        _atualizar(q, cv["id"], estado="conversando", chat_id=chat_id, conta=conta, enviadas=cv["enviadas"] + len(partes), cursor_em=datetime.now(timezone.utc),
                   enviados_recentes=(list(cv["enviados_recentes"] or []) + [normalizar(p) for p in partes])[-20:], ultima_acao_em=datetime.now(timezone.utc), motivo=None)
        q.execute("UPDATE public.quiz_respostas SET status = 'em_contato' WHERE id = %s AND status = 'novo'", (cv["resposta_id"],))
        c.commit()
        return

    # conversando: o que o lead escreveu depois do cursor
    cursor = cv["cursor_em"] or datetime.now(timezone.utc)
    todas, novas_lead = _ler_chat(q, conta, chat_id, cursor, cv.get("recomecou_em"))
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

    texto = None
    for _ in range(3):
        # o histórico tem TUDO que já saiu no chat (inclusive o que o agente mandou depois do cursor); só as mensagens novas do lead vão como "mensagem"
        antes = historico_do_chat([(m[1], m[2]) for m in todas if m not in novas_lead])
        mensagem = "\n".join(m[2] for m in novas_lead)
        log("agente X1: respondendo", str(cv["resposta_id"])[:8], f"({len(novas_lead)} mensagem(ns) do lead)")
        q.execute("UPDATE public.x1_agente_conversas SET trava_ate = now() + interval '6 minutes' WHERE id = %s", (cv["id"],)); c.commit()
        texto = _escrever(rodar_claude, log, cv, config, lead, antes, mensagem, False)
        if not texto:
            _atualizar(q, cv["id"], estado="erro", motivo="O agente não conseguiu responder agora"); c.commit(); return
        if not _lead_depois(q, conta, chat_id, ultimo_lead):
            break
        log("agente X1: o lead escreveu enquanto eu respondia, refazendo")   # descarta a resposta e gera de novo com o histórico atualizado
        todas, novas_lead = _ler_chat(q, conta, chat_id, cursor, cv.get("recomecou_em"))
        ultimo_lead = max(m[3] for m in novas_lead)
        texto = None
    if not texto:   # o lead continua escrevendo: a próxima passada responde tudo junto
        q.execute("UPDATE public.x1_agente_conversas SET trava_ate = NULL WHERE id = %s", (cv["id"],)); c.commit(); return
    if texto.lstrip().startswith("[CHAMAR_HUMANO]"):
        _gravar_raciocinio(q, cv, "\n".join(m[2] for m in novas_lead), [])
        _atualizar(q, cv["id"], estado="aguardando_humano", motivo=re.sub(r"^\[CHAMAR_HUMANO\]\s*", "", texto)[:300] or "O agente pediu uma pessoa",
                   cursor_em=ultimo_lead, recebidas=cv["recebidas"] + len(novas_lead)); c.commit()
        log("agente X1: chamou uma pessoa", str(cv["resposta_id"])[:8]); return
    partes = partes_da_resposta(texto)
    partes = enviar_partes(conta, chat_id, partes, log, config.get("comportamento"), lambda: _recentes_do_agente(q, conta, chat_id, cv),
                           parar=lambda: _lead_depois(q, conta, chat_id, ultimo_lead))
    _registrar(q, cv, partes, "Agente")
    _gravar_raciocinio(q, cv, "\n".join(m[2] for m in novas_lead), partes)
    _atualizar(q, cv["id"], cursor_em=ultimo_lead, enviadas=cv["enviadas"] + len(partes), recebidas=cv["recebidas"] + len(novas_lead),
               enviados_recentes=(list(cv["enviados_recentes"] or []) + [normalizar(p) for p in partes])[-20:], ultima_acao_em=datetime.now(timezone.utc))
    c.commit()


def _ler_chat(q, conta, chat_id, cursor, desde=None):
    """(todas as mensagens do chat desde 2 dias antes do cursor, as novas do lead depois do cursor)."""
    q.execute("""SELECT id, de_mim, COALESCE(NULLIF(btrim(texto), ''), NULLIF(btrim(transcricao), ''), CASE WHEN midia_tipo IS NOT NULL THEN '[' || midia_tipo || ']' END), COALESCE(enviada_em, recebida_em)
                 FROM public.whatsapp_mensagens WHERE conta = %s AND chat_id = %s AND COALESCE(enviada_em, recebida_em) > greatest(%s::timestamptz - interval '2 days', COALESCE(%s::timestamptz, 'epoch')) ORDER BY COALESCE(enviada_em, recebida_em)""", (conta, chat_id, cursor, desde))
    todas = q.fetchall()
    return todas, [m for m in todas if not m[1] and m[2] and m[3] > cursor]


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
