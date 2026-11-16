"""Fluxos de mensagem no WhatsApp (15/11/2026, Davi: "criar fluxos de mensagens também no WhatsApp, tipo o Many Hub").
Roda no Mac, dentro do ouvinte "só código" (o WAHA do WhatsApp do projeto está aqui). A cada poucos segundos (`passada`) cuida das execuções
(whatsapp_fluxo_execucoes = a caminhada de UM lead por um fluxo):
  iniciar             → confere o número no WhatsApp, pausa o agente automático desse lead e começa pelo primeiro bloco;
  mensagem            → manda o texto (opções viram "1) …"; links vão como "Título: url"); com opções, espera a resposta;
  esperar             → guarda a hora de retomar;
  condicao            → "respondeu?" ou "a última resposta contém a palavra"; segue por Sim/Não;
  aguardando_resposta → a resposta do lead (número, título ou texto) escolhe a saída; "Outra resposta" cobre o resto;
  fim                 → acaba.
Para sozinho se o Davi escrever na conversa (assumiu), pausar ou parar pela tela. Nunca manda de madrugada (23h às 7h de Brasília).
O desenho do fluxo é o mesmo do Many Hub (src/components/automacoes/FluxoEditor.tsx, lógica em supabase/functions/_shared/fluxo.ts)."""
import json
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402
import agente_x1 as x1  # noqa: E402

DEBOUNCE_S = 8        # espera o lead terminar de digitar
MAX_PASSOS = 40       # blocos por rodada (proteção contra laço)
ATIVAS = ("iniciar", "rodando", "aguardando_resposta", "aguardando_tempo")


# ---------------------------------------------------------------- lógica pura (testável sem banco nem WhatsApp)

def normalizar(t):
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in unicodedata.normalize("NFD", (t or "").lower()) if not unicodedata.combining(c))).strip()


def respostas_do_no(no):
    return [b for b in (no.get("dados", {}).get("botoes") or []) if b.get("tipo") == "resposta"]


def links_do_no(no):
    return [b for b in (no.get("dados", {}).get("botoes") or []) if b.get("tipo") == "link"]


def aguarda_resposta(no):
    return no.get("tipo") == "mensagem" and bool(respostas_do_no(no))


def no_por_id(g, id_):
    return next((n for n in g.get("nos", []) if n.get("id") == id_), None)


def destino(g, de, saida):
    lig = next((l for l in g.get("ligacoes", []) if l.get("de") == de and l.get("saida") == saida), None)
    return no_por_id(g, lig["para"]) if lig else None


def primeiro_no(g):
    return destino(g, "inicio", "proximo")


def preencher_variaveis(t, lead):
    """{nome}, {nome_completo}, {perfil}, {email}, {whatsapp}: o que não existe some sem deixar vírgula ou espaço sobrando (mesma regra de preencherVariaveis em fluxo.ts)."""
    lead = lead or {}
    completo = (lead.get("nome") or "").strip()
    valores = {"nome": completo.split(" ")[0] if completo else "", "nome_completo": completo, "perfil": (lead.get("perfil") or "").strip(),
               "email": (lead.get("email") or "").strip(), "whatsapp": (lead.get("whatsapp") or "").strip(), "usuario": ""}
    t = re.sub(r"\{(nome|nome_completo|usuario|perfil|email|whatsapp)\}", lambda m: valores.get(m.group(1), ""), t or "")
    t = re.sub(r"[ \t]+([,.!?;:])", r"\1", t)
    t = re.sub(r"(^|\n)[ \t]*[,;:][ \t]*", r"\1", t)
    return re.sub(r"[ \t]{2,}", " ", t).strip()


def texto_da_mensagem(no, lead):
    """O texto como vai pelo WhatsApp: variáveis trocadas; as opções viram lista numerada e os links vão por extenso."""
    t = preencher_variaveis(no.get("dados", {}).get("texto") or "", lead)
    r, l = respostas_do_no(no), links_do_no(no)
    if r:
        t += "\n\n" + "\n".join(f"{i + 1}) {b.get('titulo', '').strip()}" for i, b in enumerate(r)) + "\n\nResponda com o número."
    if l:
        t += "\n\n" + "\n".join(f"{b.get('titulo', '').strip()}: {b.get('url', '')}" for b in l)
    return t


def saida_da_resposta(no, texto):
    """Qual saída a resposta do lead escolhe: o número da lista, o título (inteiro ou como palavra) ou 'outro'."""
    r = respostas_do_no(no)
    bruto = (texto or "").strip()
    m = re.match(r"^\s*(\d{1,2})\s*[\).:-]?\s*$", bruto)
    if m and 1 <= int(m.group(1)) <= len(r):
        return r[int(m.group(1)) - 1]["id"]
    t = normalizar(bruto)
    for b in r:
        nt = normalizar(b.get("titulo", ""))
        if nt and (nt == t or f" {nt} " in f" {t} "):
            return b["id"]
    return "outro"


def avaliar_condicao(no, respondeu, ultimo_texto):
    d = no.get("dados", {})
    if d.get("condicao") == "texto_contem":
        chave = normalizar(d.get("palavra", ""))
        return bool(chave) and f" {chave} " in f" {normalizar(ultimo_texto)} "
    return bool(respondeu)


# ---------------------------------------------------------------- banco e WhatsApp

def _atualizar(q, id_, **campos):
    sets = ", ".join(f"{k} = %s" + ("::jsonb" if k == "historico" else "") for k in campos)
    q.execute(f"UPDATE public.whatsapp_fluxo_execucoes SET {sets}, trava_ate = NULL, atualizado_em = now() WHERE id = %s",
              (*[json.dumps(v, ensure_ascii=False) if k == "historico" else v for k, v in campos.items()], id_))


# ---------------------------------------------------------------- gatilhos de negócio (15/11: "virou lead e não comprou → X; comprou → Y")
# Lead elegível = do projeto do fluxo (e do quiz escolhido), com WhatsApp, criado DEPOIS de o fluxo ser ligado, ainda sem execução deste fluxo por gatilho e sem outro fluxo andando.
# "Comprou" = venda (sem reembolso) com o e-mail do lead, de data igual ou posterior ao dia em que ele virou lead; as vendas são as dos produtos do projeto.
_COMPRA = """EXISTS (SELECT 1 FROM public.vendas_plataforma_eventos v JOIN public.produtos_cliente p ON p.id = v.produto_id
                   WHERE p.cliente_id = f.cliente_id AND v.tipo = 'venda' AND lower(btrim(v.comprador_email)) = lower(btrim(r.email))
                     AND v.data >= (r.criada_em AT TIME ZONE 'America/Sao_Paulo')::date
                     AND NOT EXISTS (SELECT 1 FROM public.vendas_plataforma_eventos rb WHERE rb.produto_id = v.produto_id AND rb.tipo = 'reembolso' AND rb.transacao_id = v.transacao_id))"""
_CONDICAO = {
    "virou_lead": "r.criada_em + make_interval(mins => f.gatilho_espera_min) <= now()",
    "lead_sem_compra": f"r.criada_em + make_interval(mins => f.gatilho_espera_min) <= now() AND NOT {_COMPRA}",
    "checkout_sem_compra": f"""EXISTS (SELECT 1 FROM public.quiz_eventos ev WHERE ev.sessao = r.sessao AND ev.tipo = 'cta'
                                      AND ev.criado_em + make_interval(mins => f.gatilho_espera_min) <= now()) AND NOT {_COMPRA}""",
    "comprou": f"""{_COMPRA} AND (SELECT max(v.recebido_em) FROM public.vendas_plataforma_eventos v JOIN public.produtos_cliente p ON p.id = v.produto_id
                                   WHERE p.cliente_id = f.cliente_id AND v.tipo = 'venda' AND lower(btrim(v.comprador_email)) = lower(btrim(r.email))) + make_interval(mins => f.gatilho_espera_min) <= now()""",
}


def disparar_gatilhos(c, q, log=print):
    """Começa, para cada fluxo ativo com gatilho de negócio, a execução dos leads que cumpriram o acontecimento. No máximo 10 por rodada."""
    q.execute("SELECT id, nome, gatilho FROM public.whatsapp_fluxos WHERE ativo AND gatilho <> 'manual' AND ativado_em IS NOT NULL")
    for fid, nome, gatilho in q.fetchall():
        cond = _CONDICAO.get(gatilho)
        if not cond:
            continue
        q.execute(f"""INSERT INTO public.whatsapp_fluxo_execucoes (fluxo_id, cliente_id, user_id, resposta_id, estado, origem)
                       SELECT f.id, f.cliente_id, f.user_id, r.id, 'iniciar', 'gatilho'
                         FROM public.whatsapp_fluxos f JOIN public.quiz_respostas r ON r.cliente_id = f.cliente_id
                        WHERE f.id = %s AND (f.gatilho_quiz_id IS NULL OR r.quiz_id = f.gatilho_quiz_id)
                          AND r.criada_em >= f.ativado_em AND r.whatsapp IS NOT NULL AND btrim(r.whatsapp) <> ''
                          AND NOT EXISTS (SELECT 1 FROM public.whatsapp_fluxo_execucoes x WHERE x.resposta_id = r.id AND (x.fluxo_id = f.id OR x.estado IN ('iniciar', 'rodando', 'aguardando_resposta', 'aguardando_tempo')))
                          AND {cond}
                        ORDER BY r.criada_em LIMIT 10 ON CONFLICT DO NOTHING RETURNING resposta_id""", (fid,))
        novos = q.fetchall()
        c.commit()
        if novos:
            log(f"fluxo WhatsApp: gatilho “{gatilho}” de “{nome}” começou para {len(novos)} lead(s)")


def passada(log=print, enviar=None):
    """Trata as execuções que têm algo a fazer. `enviar(conta, chat_id, texto, comportamento)` existe para teste."""
    c = connect()
    try:
        q = c.cursor()
        try:
            disparar_gatilhos(c, q, log)
        except Exception as e:  # noqa: BLE001
            c.rollback()
            log("fluxo WhatsApp: erro nos gatilhos —", repr(e)[:200])
        q.execute("""SELECT id FROM public.whatsapp_fluxo_execucoes
                      WHERE estado IN ('iniciar', 'rodando', 'aguardando_resposta', 'aguardando_tempo')
                        AND (trava_ate IS NULL OR trava_ate < now()) AND (proximo_em IS NULL OR proximo_em <= now())
                      ORDER BY atualizado_em LIMIT 5""")
        ids = [r[0] for r in q.fetchall()]
        c.commit()
        for id_ in ids:
            try:
                _tratar(c, q, id_, log, enviar)
            except Exception as e:  # noqa: BLE001
                c.rollback()
                log("fluxo WhatsApp: erro", str(id_)[:8], repr(e)[:200])
                _atualizar(q, id_, estado="erro", motivo=f"Erro: {e}"[:300])
                c.commit()
    finally:
        c.close()


def rota_da_midia(tipo, mimetype=""):
    """Qual rota do WAHA leva cada tipo de mídia (mesma escolha do app, src-tauri/src/whatsapp.rs): foto → sendImage, áudio → sendVoice (mensagem de voz, convertida),
    vídeo → sendVideo (convertido), GIF e documentos → sendFile. Devolve (rota, converter, aceita_legenda)."""
    if tipo == "imagem" and mimetype not in ("image/gif", "image/svg+xml"):
        return "/api/sendImage", False, True
    if tipo == "audio":
        return "/api/sendVoice", True, False
    if tipo == "video":
        return "/api/sendVideo", True, True
    return "/api/sendFile", False, True


def _enviar_midia_padrao(conta, chat_id, no, comportamento, log, lead=None):
    import base64, mimetypes, ssl, urllib.request
    d = no.get("dados", {})
    url = d.get("midia_url") or ""
    if not url.startswith("https://"):
        raise ValueError("A mídia não tem arquivo")
    mime = d.get("midia_mimetype") or mimetypes.guess_type(url.split("?")[0])[0] or "application/octet-stream"
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        ctx = None
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "infopro-hub"}), timeout=60, context=ctx) as r:
        dados = base64.b64encode(r.read()).decode()
    rota, converter, aceita_legenda = rota_da_midia(d.get("midia_tipo", "arquivo"), mime)
    legenda = preencher_variaveis(d.get("texto") or "", lead)
    cfg = x1.waha_config(conta)
    corpo = {"session": cfg.get("sessao", "default"), "chatId": chat_id, "file": {"mimetype": mime, "data": dados, "filename": d.get("midia_nome") or "arquivo"}}
    if converter:
        corpo["convert"] = True
    if legenda and aceita_legenda:
        corpo["caption"] = legenda
    x1.waha_post(cfg, rota, corpo)
    if legenda and not aceita_legenda:   # áudio não leva legenda: o texto vai logo depois
        x1.waha_post(cfg, "/api/sendText", {"session": cfg.get("sessao", "default"), "chatId": chat_id, "text": legenda})


def _enviar_padrao(conta, chat_id, texto, comportamento, log):
    return x1.enviar_partes(conta, chat_id, [texto], log, comportamento, recentes=None)


def _tratar(c, q, id_, log, enviar):
    q.execute("""UPDATE public.whatsapp_fluxo_execucoes SET trava_ate = now() + interval '6 minutes'
                  WHERE id = %s AND estado IN ('iniciar', 'rodando', 'aguardando_resposta', 'aguardando_tempo') AND (trava_ate IS NULL OR trava_ate < now())
              RETURNING fluxo_id, cliente_id, resposta_id, chat_id, conta, no_atual, estado, cursor_em, enviados_recentes, historico, criado_em""", (id_,))
    r = q.fetchone()
    if not r:
        return
    ex = dict(zip(["fluxo_id", "cliente_id", "resposta_id", "chat_id", "conta", "no_atual", "estado", "cursor_em", "enviados_recentes", "historico", "criado_em"], r))
    c.commit()
    q.execute("SELECT nome, grafo, ativo FROM public.whatsapp_fluxos WHERE id = %s", (ex["fluxo_id"],))
    f = q.fetchone()
    if not f:
        _atualizar(q, id_, estado="erro", motivo="O fluxo foi apagado"); c.commit(); return
    nome_fluxo, grafo = f[0], f[1]
    q.execute("SELECT gatilho FROM public.whatsapp_fluxos WHERE id = %s", (ex["fluxo_id"],))
    gatilho = (q.fetchone() or ["manual"])[0]
    if gatilho in ("lead_sem_compra", "checkout_sem_compra"):
        # fluxo de "ainda não comprou": se a pessoa comprar no meio, ele para (ninguém quer cobrar quem já pagou)
        q.execute("""SELECT EXISTS (SELECT 1 FROM public.vendas_plataforma_eventos v JOIN public.produtos_cliente p ON p.id = v.produto_id JOIN public.quiz_respostas r ON r.id = %s
                              WHERE p.cliente_id = %s AND v.tipo = 'venda' AND lower(btrim(v.comprador_email)) = lower(btrim(r.email))
                                AND v.data >= (r.criada_em AT TIME ZONE 'America/Sao_Paulo')::date)""", (ex["resposta_id"], ex["cliente_id"]))
        if q.fetchone()[0]:
            _atualizar(q, id_, estado="parado", motivo="Comprou: o fluxo parou sozinho"); c.commit(); return
    lead = x1._contexto_lead(q, ex["resposta_id"])
    if not lead:
        _atualizar(q, id_, estado="parado", motivo="O lead não existe mais"); c.commit(); return
    q.execute("SELECT email FROM public.quiz_respostas WHERE id = %s", (ex["resposta_id"],))
    lead = {**lead, "email": (q.fetchone() or [""])[0] or ""}   # só para as variáveis das mensagens (o agente de IA não recebe o e-mail)
    q.execute("SELECT config FROM public.agentes_whatsapp WHERE cliente_id = %s", (ex["cliente_id"],))
    comportamento = ((q.fetchone() or [{}])[0] or {}).get("comportamento")
    q.execute("SELECT whatsapp_conta FROM public.clientes WHERE id = %s", (ex["cliente_id"],))
    conta = (q.fetchone() or [None])[0] or ex["conta"] or "principal"
    historico = list(ex["historico"] or [])
    agora = lambda: datetime.now(timezone.utc)  # noqa: E731
    recentes = list(ex["enviados_recentes"] or [])
    enviados_agora = []

    def anotar(no_id, tipo):
        historico.append({"no": no_id, "tipo": tipo, "em": agora().isoformat(timespec="seconds")})

    # 1) começando: confere o número e pausa o agente automático desse lead (os dois não falam juntos)
    if ex["estado"] == "iniciar":
        bruto = x1.telefone_chat(lead["whatsapp"])
        if not bruto:
            _atualizar(q, id_, estado="erro", motivo="Esse lead não tem um WhatsApp válido"); c.commit(); return
        chat_id = ex["chat_id"] or x1.resolver_chat(conta, bruto.split("@")[0])
        if not chat_id:
            _atualizar(q, id_, estado="erro", motivo="Esse número não tem WhatsApp"); c.commit(); return
        q.execute("""UPDATE public.x1_agente_conversas SET estado = 'pausado', motivo = %s, atualizado_em = now()
                      WHERE resposta_id = %s AND estado IN ('abordar', 'conversando', 'aprovacao')""", (f'Fluxo "{nome_fluxo}" em andamento', ex["resposta_id"]))
        q.execute("UPDATE public.whatsapp_fluxos SET disparos = disparos + 1 WHERE id = %s", (ex["fluxo_id"],))
        q.execute("UPDATE public.quiz_respostas SET status = 'em_contato' WHERE id = %s AND status = 'novo'", (ex["resposta_id"],))
        prim = primeiro_no(grafo)
        if not prim:
            _atualizar(q, id_, estado="erro", motivo="O fluxo não tem uma primeira mensagem"); c.commit(); return
        ex.update(chat_id=chat_id, no_atual=prim["id"], cursor_em=agora(), estado="rodando")
        q.execute("UPDATE public.whatsapp_fluxo_execucoes SET chat_id = %s, conta = %s WHERE id = %s", (chat_id, conta, id_))
        c.commit()
        atual = prim
    else:
        chat_id = ex["chat_id"]
        no_atual = no_por_id(grafo, ex["no_atual"])
        todas, novas_lead = x1._ler_chat(q, conta, chat_id, ex["cursor_em"] or ex["criado_em"])
        # O Davi escreveu por conta própria? Então ele assumiu: o fluxo para.
        proprias = [m for m in todas if m[1] and m[2] and m[3] > (ex["cursor_em"] or ex["criado_em"])]
        if any(not x1.e_do_robo(m[2], recentes) for m in proprias):
            _atualizar(q, id_, estado="pausado", motivo="Você escreveu na conversa: o fluxo parou (clique em Retomar)"); c.commit(); return
        modo = ex["estado"]
        if modo == "rodando":
            # Retomado depois de pausa (ou mensagem adiada de madrugada): olha o que já foi feito no bloco onde parou, para não repetir nada.
            ult = historico[-1] if historico else {}
            if ult.get("no") == ex["no_atual"] and ult.get("tipo") == "mensagem":
                modo = "aguardando_resposta" if (no_atual and aguarda_resposta(no_atual)) else "aguardando_tempo_ja"
            elif ult.get("no") == ex["no_atual"] and ult.get("tipo") == "espera":
                modo = "aguardando_tempo"
            else:
                modo = "executar"
        if modo == "executar":
            atual = no_atual
        elif modo == "aguardando_tempo_ja":   # a mensagem sem opções já saiu: segue para o próximo bloco
            atual = destino(grafo, ex["no_atual"], "proximo")
        elif modo == "aguardando_tempo":
            atual = destino(grafo, ex["no_atual"], "proximo")
            anotar(ex["no_atual"], "esperou")
        else:   # aguardando_resposta
            if not novas_lead:
                if ex["estado"] == "rodando":   # retomado: volta a esperar a resposta de verdade
                    _atualizar(q, id_, estado="aguardando_resposta", cursor_em=agora())
                else:
                    q.execute("UPDATE public.whatsapp_fluxo_execucoes SET trava_ate = NULL WHERE id = %s", (id_,))
                c.commit(); return
            ultimo = max(m[3] for m in novas_lead)
            if (agora() - ultimo).total_seconds() < DEBOUNCE_S:   # ainda digitando
                q.execute("UPDATE public.whatsapp_fluxo_execucoes SET trava_ate = NULL WHERE id = %s", (id_,)); c.commit(); return
            texto = "\n".join(m[2] for m in novas_lead)
            saida = saida_da_resposta(no_atual, texto) if no_atual else "outro"
            anotar(ex["no_atual"], f"resposta:{saida}")
            atual = destino(grafo, ex["no_atual"], saida)
            ex["cursor_em"] = ultimo
            ex["ultimo_texto"] = texto
            if not atual:   # resposta sem caminho (sem "Outra resposta" ligada): segue esperando outra
                _atualizar(q, id_, historico=historico, cursor_em=ultimo); c.commit(); return
            ex["respondeu"] = True

    # 2) anda pelos blocos até uma pausa (espera, resposta) ou o fim
    respondeu = bool(ex.get("respondeu"))
    ultimo_texto = ex.get("ultimo_texto", "")
    if not respondeu:
        q.execute("SELECT count(*) FROM public.whatsapp_mensagens WHERE conta = %s AND chat_id = %s AND NOT de_mim AND COALESCE(enviada_em, recebida_em) > %s",
                  (conta, chat_id, ex["criado_em"]))
        respondeu = (q.fetchone() or [0])[0] > 0
    novo = {}
    for _ in range(MAX_PASSOS):
        if not atual:
            novo = {"estado": "fim", "no_atual": None}; break
        tipo = atual.get("tipo")
        if tipo == "inicio":
            atual = destino(grafo, atual["id"], "proximo"); continue
        if tipo == "fim":
            anotar(atual["id"], "fim"); novo = {"estado": "fim", "no_atual": atual["id"]}; break
        if tipo == "esperar":
            minutos = max(1, int(atual.get("dados", {}).get("minutos") or 10))
            anotar(atual["id"], "espera")
            novo = {"estado": "aguardando_tempo", "no_atual": atual["id"], "proximo_em": agora() + timedelta(minutes=minutos)}; break
        if tipo == "condicao":
            sim = avaliar_condicao(atual, respondeu, ultimo_texto)
            anotar(atual["id"], "condicao:" + ("sim" if sim else "nao"))
            atual = destino(grafo, atual["id"], "sim" if sim else "nao"); continue
        if tipo == "midia":
            if not x1.no_horario():
                novo = {"estado": "rodando", "no_atual": atual["id"], "proximo_em": agora() + timedelta(minutes=15)}
                ex["adiado"] = True; break
            d = atual.get("dados", {})
            if enviar:
                enviar(conta, chat_id, f"[midia:{d.get('midia_tipo')}] {d.get('midia_url')} | {(d.get('texto') or '').strip()}", comportamento)
            else:
                _enviar_midia_padrao(conta, chat_id, atual, comportamento, log, lead)
            resumo = f"[{d.get('midia_tipo', 'arquivo')}] {(d.get('texto') or '').strip()}".strip()
            enviados_agora.append(resumo)
            recentes.append(x1.normalizar(resumo))
            anotar(atual["id"], "mensagem")
            atual = destino(grafo, atual["id"], "proximo"); continue
        if tipo == "mensagem":
            if not x1.no_horario():   # de madrugada espera amanhecer
                novo = {"estado": "rodando", "no_atual": atual["id"], "proximo_em": agora() + timedelta(minutes=15)}
                ex["adiado"] = True; break
            texto = texto_da_mensagem(atual, lead)
            if enviar:
                enviar(conta, chat_id, texto, comportamento)
            else:
                _enviar_padrao(conta, chat_id, texto, comportamento, log)
            enviados_agora.append(texto)
            recentes.append(x1.normalizar(texto))
            anotar(atual["id"], "mensagem")
            if aguarda_resposta(atual):
                novo = {"estado": "aguardando_resposta", "no_atual": atual["id"], "cursor_em": agora()}; break
            atual = destino(grafo, atual["id"], "proximo"); continue
        atual = None
    else:
        novo = {"estado": "erro", "motivo": "O fluxo passou de 40 blocos seguidos (laço?)"}

    # 3) grava tudo
    if enviados_agora:
        q.execute("SELECT quiz_id FROM public.quiz_respostas WHERE id = %s", (ex["resposta_id"],))
        quiz_id = q.fetchone()[0]
        for t in enviados_agora:
            q.execute("INSERT INTO public.quiz_abordagens (quiz_id, resposta_id, cliente_id, texto, modelo) VALUES (%s, %s, %s, %s, %s)",
                      (quiz_id, ex["resposta_id"], ex["cliente_id"], t[:4000], f"Fluxo: {nome_fluxo}"[:60]))
    campos = dict(historico=historico, enviados_recentes=recentes[-20:], motivo=novo.pop("motivo", None), **novo)
    if "cursor_em" not in campos and ex.get("cursor_em"):
        campos["cursor_em"] = ex["cursor_em"]
    campos.setdefault("proximo_em", None)
    q.execute("UPDATE public.whatsapp_fluxo_execucoes SET enviados_recentes = %s WHERE id = %s", (campos.pop("enviados_recentes"), id_))
    _atualizar(q, id_, **campos)
    c.commit()
    log("fluxo WhatsApp:", nome_fluxo, "·", str(ex["resposta_id"])[:8], "→", campos.get("estado"), f"({len(enviados_agora)} mensagem(ns))")


def reenfileirar():
    """No início do ouvinte: execução que ficou travada no meio volta para ser olhada."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.whatsapp_fluxo_execucoes SET trava_ate = NULL WHERE trava_ate IS NOT NULL AND estado IN ('iniciar', 'rodando', 'aguardando_resposta', 'aguardando_tempo')")
        n = q.rowcount
        c.commit()
        return n
    finally:
        c.close()


if __name__ == "__main__" and "--teste" in sys.argv:
    # Autoteste da lógica pura: python3 scripts/fluxo_whatsapp.py --teste
    g = {"nos": [{"id": "inicio", "tipo": "inicio", "dados": {}},
                 {"id": "m1", "tipo": "mensagem", "dados": {"texto": "Oi, {nome}! Quer o link?", "botoes": [{"id": "b1", "tipo": "resposta", "titulo": "Quero"}, {"id": "b2", "tipo": "resposta", "titulo": "Agora não"}]}},
                 {"id": "m2", "tipo": "mensagem", "dados": {"texto": "Segue", "botoes": [{"id": "l1", "tipo": "link", "titulo": "Acessar", "url": "https://x.co"}]}},
                 {"id": "c1", "tipo": "condicao", "dados": {"condicao": "texto_contem", "palavra": "preço"}}],
         "ligacoes": [{"de": "inicio", "saida": "proximo", "para": "m1"}, {"de": "m1", "saida": "b1", "para": "m2"}]}
    m1 = no_por_id(g, "m1")
    assert primeiro_no(g)["id"] == "m1"
    assert preencher_variaveis("Oi {nome}!", {}) == "Oi!" and preencher_variaveis("{nome}, vamos?", {}) == "vamos?" and preencher_variaveis("Plano de {nome_completo} ({perfil})", {"nome": "Ana Lima", "perfil": "Rei"}) == "Plano de Ana Lima (Rei)"
    assert texto_da_mensagem(m1, {"nome": "Ana Paula"}).startswith("Oi, Ana!") and "1) Quero" in texto_da_mensagem(m1, {}) and "Responda com o número" in texto_da_mensagem(m1, {})
    assert "Acessar: https://x.co" in texto_da_mensagem(no_por_id(g, "m2"), {})
    assert saida_da_resposta(m1, "1") == "b1" and saida_da_resposta(m1, " 2) ") == "b2" and saida_da_resposta(m1, "quero sim") == "b1" and saida_da_resposta(m1, "talvez") == "outro" and saida_da_resposta(m1, "9") == "outro"
    assert aguarda_resposta(m1) and not aguarda_resposta(no_por_id(g, "m2"))
    assert avaliar_condicao(no_por_id(g, "c1"), False, "qual o PREÇO?") and not avaliar_condicao(no_por_id(g, "c1"), False, "preços") and avaliar_condicao({"dados": {"condicao": "respondeu"}}, True, "")
    assert rota_da_midia("imagem", "image/png") == ("/api/sendImage", False, True) and rota_da_midia("imagem", "image/gif")[0] == "/api/sendFile"
    assert rota_da_midia("audio") == ("/api/sendVoice", True, False) and rota_da_midia("video")[0] == "/api/sendVideo" and rota_da_midia("arquivo")[0] == "/api/sendFile"
    print("fluxo_whatsapp: autoteste ok")
