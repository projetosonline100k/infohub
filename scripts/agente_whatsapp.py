"""Inteligência do agente do WhatsApp (12/11/2026, Davi: "no X1 vou conversando e a gente monta a inteligência do agente que vende").

O app grava o pedido em public.agente_whatsapp_pedidos; o ouvinte do Atlas chama `atender(rodar_claude)` num laço, pede ao Claude (plano do Davi,
`claude -p`) e grava a resposta. Dois tipos:
  - construir: entrevista. O Claude devolve a resposta (curta, com UMA pergunta) e a inteligência inteira já atualizada (JSON).
  - simular:   o Davi faz o papel do lead; o Claude responde como o agente responderia (texto puro), em 1, 2 ou 3 mensagens sorteadas.
O Claude NÃO mexe em arquivo nem no banco e NÃO envia nada a ninguém: só devolve texto.
"""
import json
import random
import re
from migration_db import connect

FORMATO = """{
 "comportamento": {"separar": true, "pausa": true, "pausa_min_s": 1.5, "pausa_max_s": 7, "ms_por_letra": 40},
 "produto": {"nome": "", "descricao": "", "para_quem": "", "resultado": ""},
 "ofertas": [{"nome": "", "preco": "", "link": "", "condicoes": "", "bonus": "", "garantia": ""}],
 "objetivo": "", "tom": "", "apresentacao": "",
 "etapas": ["passo da conversa"], "pode": ["..."], "nao_pode": ["..."],
 "objecoes": [{"objecao": "", "resposta": ""}],
 "perfis": [{"perfil": "nome do perfil do quiz", "abordagem": "como tratar quem caiu nele"}],
 "chamar_humano": ["quando passar para o Davi"], "extras": ""
}"""

PROMPT_CONSTRUIR = """Você é a GABRIELA, a agente que o Davi deixou viva neste setor para montar e manter a INTELIGÊNCIA do agente de vendas que vai conversar no WhatsApp com leads de um quiz.
Você continua a mesma conversa de sempre: lembra de tudo que ele já pediu, ajustou e decidiu, e cada pedido novo é uma ordem que você implementa na hora, sem esquecer as anteriores. Ele fala com você como com uma colega de equipe.
Português simples, sem enrolação. Quando precisar, pergunte; quando for ordem clara, cumpra e diga o que mudou.

Regras:
- Atualize a inteligência SÓ com o que o Davi disse (ou com o que está no contexto do quiz: título e perfis). NUNCA invente preço, prazo, garantia, bônus, link, resultado ou promessa. O que não souber, deixe vazio e pergunte.
- Responda em até 4 frases e faça UMA pergunta por vez, sobre o que mais falta. Ordem de prioridade: produto, oferta (preço e link de compra), objetivo, o que o agente NÃO pode fazer, tom de voz, caminho da conversa, respostas às objeções, quando chamar o Davi.
- Se ele colar um texto grande (página de vendas, roteiro, FAQ), extraia o que couber em produto, ofertas, objeções e caminho; diga em uma frase o que entendeu e o que ainda falta.
- Toda ordem permanente do Davi ("sempre faça X", "nunca Y", "mande em mensagens separadas") deve ficar escrita na inteligência (pode, nao_pode, etapas, tom, apresentacao, objecoes ou extras) com as palavras dele, para valer mesmo que esta conversa seja zerada. Antes de responder, confira se as ordens anteriores continuam lá.
- Mantenha tudo o que já estava preenchido e ele não pediu para mudar. Listas (pode, nao_pode, etapas, objecoes, perfis, chamar_humano) devolva completas, não só o item novo.
- SE VIRE para descobrir as coisas, em vez de perguntar o que dá para achar: antes de perguntar, consulte. Você pode (SOMENTE LEITURA):
  * o quiz: python3 scripts/consulta.py "select titulo, slug, estrutura from quizzes where id = '{quiz_id}'" (a estrutura traz oferta, preços, bônus, depoimentos, perguntas, perfis e textos);
  * as respostas/leads do quiz: tabela quiz_respostas (perfil, respostas) e vendas/eventos; python3 scripts/consulta.py --tabelas e --colunas <tabela> mostram o que existe;
  * o projeto (cliente_id = '{cliente_id}'): clientes, produtos_cliente, nucleo_influencia, agentes_ia/conhecimentos_agente, documentos, ideias_conteudo etc.;
  * páginas na internet (WebFetch/WebSearch), por exemplo a página de vendas ou o checkout cujo link o Davi passar.
  Preencha a inteligência com o que achar, deixando claro na resposta o que você tirou de onde ("tirei o preço do quiz") e só pergunte o que não achou. Preço, link, garantia e bônus só entram se estiverem no quiz, na página ou o Davi disse.
- Você NÃO escreve nada (nem arquivo, nem banco) e NÃO envia mensagem a ninguém. Só lê e responde.

"comportamento" é COMO o agente manda (isto você controla): separar = cada ideia vai em mensagem separada (true) ou tudo num balão só (false); pausa = espera "digitando…" entre mensagens; pausa_min_s/pausa_max_s = limites da espera em segundos; ms_por_letra = quanto a espera cresce por caractere do texto (mais alto = mais devagar). Se o Davi pedir "mais devagar", "mais rápido", "sem pausa" ou "tudo junto", ajuste esses números/chaves (e diga o valor novo); texto e regras vão nos outros campos.

Formato da inteligência (JSON):
{formato}

PEDIDOS DE SISTEMA: se o Davi pedir algo que a inteligência NÃO resolve e exige mudar o código do app (tela nova, botão, enviar áudio, reagir a evento, integração, mudança de como o agente envia/recebe), você NÃO diz que não dá: abra um pedido para a fila de desenvolvimento, que o Claude Code implementa. Coloque em "pedidos_sistema" uma lista com {{"titulo": "curto", "descricao": "completa e autossuficiente: o que o Davi pediu (nas palavras dele), onde fica (X1 do quiz > aba Inteligência do agente: src/components/quiz/AgenteX1.tsx, src/lib/agenteWhatsapp.ts, scripts/agente_whatsapp.py, tabelas agentes_whatsapp e agente_whatsapp_pedidos) e como saber que ficou pronto"}}. Antes, confira se já não existe um parecido: python3 scripts/consulta.py "select titulo, status, left(coalesce(resultado, erro, ''), 200) from ponte_pedidos where origem = 'gabriela' order by criado_em desc limit 15". Se o Davi perguntar como estão os pedidos, consulte essa mesma tabela e conte o status em linguagem simples (pendente = na fila, em_andamento = sendo feito, concluido = pronto, erro = não deu). Na resposta, diga em uma frase o que foi para a fila. Pedido que cabe na inteligência (regra, tom, comportamento) você resolve sozinha, sem abrir pedido.

Responda SOMENTE com JSON, sem texto antes nem depois: {{"resposta": "sua fala para o Davi", "config": <a inteligência inteira, já atualizada>, "pedidos_sistema": [] (opcional)}}.

CONTEXTO DO QUIZ:
{contexto}

INTELIGÊNCIA ATUAL:
{config}

CONVERSA ATÉ AGORA:
{historico}

{modo_ajuste}
MENSAGEM DO DAVI:
{mensagem}"""

PROMPT_SIMULAR = """Você é o AGENTE DE VENDAS no WhatsApp, com a inteligência abaixo, conversando agora com um LEAD que fez um quiz. O Davi está testando: ele faz o papel do lead.
Escreva SÓ a próxima mensagem do agente, como no WhatsApp: curta (1 a 4 linhas), humana, no tom definido, sem listas longas e sem exagero de emoji.
Regras:
- Siga o objetivo, o tom e o caminho da conversa; use as respostas às objeções quando fizerem sentido; respeite o que PODE e o que NÃO PODE.
- NUNCA invente preço, prazo, garantia, bônus ou link que não esteja na inteligência. Se não souber, diga que vai confirmar.
- Se o lead pedir algo fora do que pode, ou cair num caso de "chamar_humano", comece a resposta com [CHAMAR_HUMANO] e diga que vai chamar o Davi.
- Se comportamento.separar for false, escreva tudo em UMA mensagem só (sem ---). Caso contrário (padrão), se a inteligência mandar enviar em mensagens separadas (ou a resposta tiver mais de uma ideia/etapa), escreva cada mensagem como um envio distinto, separando-as com uma linha contendo apenas --- (três hífens). Nunca junte duas mensagens no mesmo balão.
- Você NÃO usa ferramentas e NÃO acessa arquivos: só responde com o texto das mensagens.
{quantidade}
INTELIGÊNCIA DO AGENTE:
{config}

DADOS DO LEAD (simulado):
{contexto}

CONVERSA ATÉ AGORA:
{historico}

ÚLTIMA MENSAGEM DO LEAD:
{mensagem}

Responda apenas com o texto da(s) mensagem(ns) do agente."""


def _historico(h):
    linhas = []
    for m in (h or [])[-40:]:
        quem = {"user": "Davi", "assistant": "Você", "lead": "Lead", "agente": "Agente"}.get(m.get("papel"), "?")
        linhas.append(f"- {quem}: {str(m.get('texto', ''))[:1500]}")
    return "\n".join(linhas) or "(começo)"


AJUSTE = """ATENÇÃO: a mensagem começa com [ajuste]. O Davi está te ENSINANDO algo para o agente aprender (uma correção ou uma regra nova, muitas vezes depois de testar o agente).
Incorpore na inteligência agora, no lugar certo (pode, nao_pode, tom, etapas, objecoes, perfis, chamar_humano ou extras), mantendo o resto. Escreva a regra de forma clara e geral, não só para este caso.
Responda em 1 ou 2 frases dizendo o que você gravou e onde. Não faça pergunta a menos que seja impossível entender.
"""


AJUSTE_CONVERSA = """MODO AJUSTE LIGADO: o Davi está testando o agente e agora conversa com VOCÊ (Gabriela) sobre o teste, não faz o papel do lead. Em "conversa_de_teste" (no contexto do quiz) está o que o agente e o lead falaram até agora.
Converse como colega: explique por que o agente respondeu daquele jeito (qual regra da inteligência levou a isso), responda às dúvidas dele e sugira melhorias concretas e curtas. Pode discordar e dar opinião de quem entende de vendas no WhatsApp.
Só altere a inteligência quando ele pedir ou concordar com uma sugestão; aí aplique na hora e diga o que mudou. Se ele só estiver tirando dúvida, devolva a inteligência igual, sem mudar nada. Termine, quando fizer sentido, com UMA sugestão ou pergunta para a próxima melhoria.
"""


# Davi (12/11): "estamos simulando uma pessoa: às vezes uma mensagem, às vezes 2, às vezes 3" — o agente vinha sempre em 2.
# Cada resposta sorteia quantas mensagens manda (~60% 1, 30% 2, 10% 3); a abertura segue como a inteligência definir.
PESOS_QUANTIDADE = {1: 68, 2: 24, 3: 8}   # com a regra de não repetir (sortear_quantidade), dá ~60/30/10 na prática
_SEP = re.compile(r"\n\s*-{3,}\s*\n")


def _quantidades_anteriores(historico):
    """Quantas mensagens o agente mandou em cada resposta anterior (cada balão é uma entrada 'agente' seguida no histórico)."""
    qtds, seguidas = [], 0
    for m in historico or []:
        if m.get("papel") == "agente":
            seguidas += 1
        elif seguidas:
            qtds.append(seguidas)
            seguidas = 0
    if seguidas:
        qtds.append(seguidas)
    return qtds


def sortear_quantidade(historico, sorteio=random):
    """Sorteia 1, 2 ou 3 pelos pesos, sem repetir a mesma quantidade pela 3ª vez seguida (a de 1, por ser a mais comum, pela 4ª)."""
    ant = _quantidades_anteriores(historico)
    pesos = dict(PESOS_QUANTIDADE)
    if ant and ant[-1] in pesos:
        limite = 3 if ant[-1] == 1 else 2
        if len(ant) >= limite and len(set(ant[-limite:])) == 1:
            pesos.pop(ant[-1])
    return sorteio.choices(list(pesos), weights=list(pesos.values()))[0]


def _dividir(parte):
    """Parte uma mensagem em duas: primeiro por parágrafo/linha, senão pela frase do meio. None se não der."""
    linhas = [x.strip() for x in parte.split("\n") if x.strip()]
    if len(linhas) < 2:
        linhas = [x.strip() for x in re.split(r"(?<=[.!?…])\s+", parte.strip()) if x.strip()]
    if len(linhas) < 2:
        return None
    meio = min(range(1, len(linhas)), key=lambda i: abs(len(" ".join(linhas[:i])) - len(" ".join(linhas[i:]))))
    return [" ".join(linhas[:meio]), " ".join(linhas[meio:])]


def ajustar_quantidade(texto, alvo):
    """Junta ou divide as mensagens (separadas por ---) até chegar no alvo. A pausa de digitando entre elas o app já faz."""
    partes = [x.strip() for x in _SEP.split(texto.strip()) if x.strip()]
    if not partes:
        return texto.strip()
    while len(partes) > alvo:   # junta o par vizinho mais curto
        i = min(range(len(partes) - 1), key=lambda k: len(partes[k]) + len(partes[k + 1]))
        partes[i:i + 2] = [partes[i] + "\n" + partes[i + 1]]
    while len(partes) < alvo:   # divide a mais longa (se não der para dividir, fica com menos)
        i = max(range(len(partes)), key=lambda k: len(partes[k]))
        metade = _dividir(partes[i])
        if not metade:
            break
        partes[i:i + 1] = metade
    return "\n---\n".join(partes)


def _alvo(p):
    """Quantidade de mensagens desta resposta do teste; None na abertura ou se a inteligência manda tudo num balão só."""
    if p["tipo"] != "simular" or p["contexto"].get("iniciar"):
        return None
    if ((p["config_atual"] or {}).get("comportamento") or {}).get("separar") is False:
        return None
    return sortear_quantidade(p["historico"])


def _prompt(p, alvo=None):
    base = dict(quiz_id=p["contexto"].get("quiz_id", ""), cliente_id=p["cliente_id"], config=json.dumps(p["config_atual"], ensure_ascii=False), contexto=json.dumps(p["contexto"], ensure_ascii=False),
                historico=_historico(p["historico"]), mensagem=p["mensagem"])
    if p["tipo"] == "simular":
        if p["contexto"].get("iniciar"):
            # Zerou o teste: o agente abre a conversa, como faria ao abordar o lead (que ainda não escreveu nada).
            base["mensagem"] = "(o lead ainda não escreveu nada: é VOCÊ quem começa a conversa, com a mensagem de abordagem inicial, usando o que sabe do lead e do quiz)"
            if p["contexto"].get("origem") == "x1":
                # Botão "Abordar" do X1 (13/11): lead REAL; o Davi lê, ajusta e envia. Use o nome, o perfil e as respostas do quiz.
                base["mensagem"] = ("(LEAD REAL do quiz: escreva a mensagem de ABORDAGEM que o Davi vai ler, ajustar e enviar pelo WhatsApp. Use o primeiro nome, o perfil e 1 ou 2 respostas do quiz que mostrem que você prestou atenção"
                                    "; se ele foi ao checkout e não comprou, retome isso com leveza; se já comprou, agradeça e oriente o acesso. Só o texto, sem comentários seus.)")
        quantidade = ""
        if alvo:
            quantidade = ("- NESTA resposta, mande exatamente 1 mensagem (um balão só, sem ---), como uma pessoa que responde rápido. Isto vale mais do que a regra de separar ideias.\n" if alvo == 1 else
                          f"- NESTA resposta, mande exatamente {alvo} mensagens, separadas por ---. Pessoas de verdade variam: nem sempre é reação + pergunta. Isto vale mais do que a regra de separar ideias.\n")
        return PROMPT_SIMULAR.format(quantidade=quantidade, **base)
    ajuste = p["mensagem"].lstrip().lower().startswith("[ajuste]")
    modo = AJUSTE_CONVERSA if p["contexto"].get("conversa") == "ajuste" else AJUSTE if ajuste else ""
    return PROMPT_CONSTRUIR.format(formato=FORMATO, modo_ajuste=modo, **base)


def extrair(texto):
    """(resposta, config|None, pedidos_sistema). Se o Claude só conversou (sem JSON válido), devolve o texto, config None e nenhum pedido."""
    try:
        i, f = texto.find("{"), texto.rfind("}")
        d = json.loads(texto[i:f + 1])
        pedidos = [x for x in (d.get("pedidos_sistema") or []) if isinstance(x, dict) and str(x.get("titulo", "")).strip() and str(x.get("descricao", "")).strip()][:3]
        if isinstance(d.get("config"), dict):
            return str(d.get("resposta") or "Pronto, atualizei a inteligência."), d["config"], pedidos
        if isinstance(d.get("resposta"), str):
            return d["resposta"], None, pedidos
    except (ValueError, TypeError):
        pass
    return texto.strip(), None, []


def abrir_pedidos(q, pedidos, log=print, origem="gabriela"):
    """Pedidos que exigem código vão para a fila da ponte (ponte_pedidos), que o Claude Code implementa.
    Davi (12/11): "tudo que for desta complexidade vai para a fila e é implementado" — entram já aprovados."""
    abertos = []
    for x in pedidos:
        titulo = str(x["titulo"]).strip()[:160]
        q.execute("SELECT 1 FROM public.ponte_pedidos WHERE titulo = %s AND status IN ('pendente', 'em_andamento', 'aguardando_aprovacao')", (titulo,))
        if q.fetchone():
            continue
        q.execute("""INSERT INTO public.ponte_pedidos (origem, titulo, descricao, prioridade, requer_aprovacao, aprovado)
                     VALUES (%s, %s, %s, 'normal', true, true)""",
                  (origem, titulo, f"Pedido do Davi a {origem.capitalize()}. " + str(x["descricao"]).strip()[:6000]))
        abertos.append(titulo)
        log("agente: pedido de sistema na fila —", titulo)
    return abertos


def atender(rodar_claude, log=print):
    """Atende UM pedido pendente (se houver)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.agente_whatsapp_pedidos SET status = 'processando'
                     WHERE id = (SELECT id FROM public.agente_whatsapp_pedidos WHERE status = 'pendente' ORDER BY criado_em LIMIT 1 FOR UPDATE SKIP LOCKED)
                     RETURNING id, tipo, mensagem, contexto, historico, config_atual, cliente_id""")
        r = q.fetchone()
        c.commit()
        if not r:
            return
        p = {"id": r[0], "tipo": r[1], "mensagem": r[2], "contexto": r[3], "historico": r[4], "config_atual": r[5], "cliente_id": str(r[6])}
        log("agente:", p["tipo"], str(p["id"])[:8], f"({len(p['mensagem'])} caracteres)")
        alvo = _alvo(p)
        if p["tipo"] == "simular":
            ok, texto = rodar_claude(_prompt(p, alvo), minutos=4, turnos=3, ferramentas=["Read"])
            if ok and alvo and texto.strip():
                texto = ajustar_quantidade(texto, alvo)
                log("agente: simulação em", alvo, "mensagem(ns)")
        else:   # montar: a Gabriela (sessão contínua) pode consultar o quiz, o banco (só leitura) e a internet
            ferr = ["Bash(python3 scripts/consulta.py:*)", "Read", "Grep", "Glob", "WebFetch", "WebSearch"]
            q.execute("SELECT sessao_construir FROM public.agentes_whatsapp WHERE cliente_id = %s", (p["cliente_id"],))
            linha = q.fetchone()
            sessao = linha[0] if linha else None
            info = {}
            ok, texto = rodar_claude(_prompt(p), minutos=12, turnos=30, sessao=sessao, info=info, ferramentas=ferr)
            if not ok and sessao:   # sessão guardada expirou: recomeça (a inteligência e o histórico vão no prompt)
                info = {}
                ok, texto = rodar_claude(_prompt(p), minutos=12, turnos=30, info=info, ferramentas=ferr)
            if ok and info.get("session_id"):
                q.execute("""INSERT INTO public.agentes_whatsapp (cliente_id, user_id, sessao_construir) SELECT id, user_id, %s FROM public.clientes WHERE id = %s
                             ON CONFLICT (cliente_id) DO UPDATE SET sessao_construir = EXCLUDED.sessao_construir""", (info["session_id"], p["cliente_id"]))
        if not ok or not texto.strip():
            q.execute("UPDATE public.agente_whatsapp_pedidos SET status='erro', erro=%s, respondido_em=now() WHERE id=%s", ((texto or "sem resposta")[:300], p["id"]))
            log("agente: erro —", (texto or "")[:120])
        elif p["tipo"] == "simular":
            q.execute("UPDATE public.agente_whatsapp_pedidos SET status='respondido', resposta=%s, respondido_em=now() WHERE id=%s", (texto.strip(), p["id"]))
            log("agente: simulação respondida")
        else:
            resposta, config, pedidos = extrair(texto)
            abertos = abrir_pedidos(q, pedidos, log)
            if abertos:
                resposta += "\n\n🛠 Na fila de desenvolvimento: " + "; ".join(abertos)
            q.execute("UPDATE public.agente_whatsapp_pedidos SET status='respondido', resposta=%s, config=%s::jsonb, respondido_em=now() WHERE id=%s",
                      (resposta, json.dumps(config, ensure_ascii=False) if config else None, p["id"]))
            log("agente: respondido" + ("" if config else " (só conversa)"))
        c.commit()
    finally:
        c.close()


def reenfileirar():
    """No início do ouvinte: pedido que ficou 'processando' (o ouvinte reiniciou no meio) volta para a fila."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.agente_whatsapp_pedidos SET status='pendente' WHERE status='processando' AND criado_em > now() - interval '10 minutes'")
        n = q.rowcount
        c.commit()
        return n
    finally:
        c.close()
