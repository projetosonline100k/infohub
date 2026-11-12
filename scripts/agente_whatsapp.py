"""Inteligência do agente do WhatsApp (12/11/2026, Davi: "no X1 vou conversando e a gente monta a inteligência do agente que vende").

O app grava o pedido em public.agente_whatsapp_pedidos; o ouvinte do Atlas chama `atender(rodar_claude)` num laço, pede ao Claude (plano do Davi,
`claude -p`) e grava a resposta. Dois tipos:
  - construir: entrevista. O Claude devolve a resposta (curta, com UMA pergunta) e a inteligência inteira já atualizada (JSON).
  - simular:   o Davi faz o papel do lead; o Claude responde como o agente responderia (texto puro).
O Claude NÃO mexe em arquivo nem no banco e NÃO envia nada a ninguém: só devolve texto.
"""
import json
from migration_db import connect

FORMATO = """{
 "produto": {"nome": "", "descricao": "", "para_quem": "", "resultado": ""},
 "ofertas": [{"nome": "", "preco": "", "link": "", "condicoes": "", "bonus": "", "garantia": ""}],
 "objetivo": "", "tom": "", "apresentacao": "",
 "etapas": ["passo da conversa"], "pode": ["..."], "nao_pode": ["..."],
 "objecoes": [{"objecao": "", "resposta": ""}],
 "perfis": [{"perfil": "nome do perfil do quiz", "abordagem": "como tratar quem caiu nele"}],
 "chamar_humano": ["quando passar para o Davi"], "extras": ""
}"""

PROMPT_CONSTRUIR = """Você ajuda o Davi a montar a INTELIGÊNCIA de um agente de vendas que vai conversar no WhatsApp com leads de um quiz.
É uma entrevista: ele conta, você organiza e pergunta o que falta. Português simples, sem enrolação.

Regras:
- Atualize a inteligência SÓ com o que o Davi disse (ou com o que está no contexto do quiz: título e perfis). NUNCA invente preço, prazo, garantia, bônus, link, resultado ou promessa. O que não souber, deixe vazio e pergunte.
- Responda em até 4 frases e faça UMA pergunta por vez, sobre o que mais falta. Ordem de prioridade: produto, oferta (preço e link de compra), objetivo, o que o agente NÃO pode fazer, tom de voz, caminho da conversa, respostas às objeções, quando chamar o Davi.
- Se ele colar um texto grande (página de vendas, roteiro, FAQ), extraia o que couber em produto, ofertas, objeções e caminho; diga em uma frase o que entendeu e o que ainda falta.
- Mantenha tudo o que já estava preenchido e ele não pediu para mudar. Listas (pode, nao_pode, etapas, objecoes, perfis, chamar_humano) devolva completas, não só o item novo.
- SE VIRE para descobrir as coisas, em vez de perguntar o que dá para achar: antes de perguntar, consulte. Você pode (SOMENTE LEITURA):
  * o quiz: python3 scripts/consulta.py "select titulo, slug, estrutura from quizzes where id = '{quiz_id}'" (a estrutura traz oferta, preços, bônus, depoimentos, perguntas, perfis e textos);
  * as respostas/leads do quiz: tabela quiz_respostas (perfil, respostas) e vendas/eventos; python3 scripts/consulta.py --tabelas e --colunas <tabela> mostram o que existe;
  * o projeto (cliente_id = '{cliente_id}'): clientes, produtos_cliente, nucleo_influencia, agentes_ia/conhecimentos_agente, documentos, ideias_conteudo etc.;
  * páginas na internet (WebFetch/WebSearch), por exemplo a página de vendas ou o checkout cujo link o Davi passar.
  Preencha a inteligência com o que achar, deixando claro na resposta o que você tirou de onde ("tirei o preço do quiz") e só pergunte o que não achou. Preço, link, garantia e bônus só entram se estiverem no quiz, na página ou o Davi disse.
- Você NÃO escreve nada (nem arquivo, nem banco) e NÃO envia mensagem a ninguém. Só lê e responde.

Formato da inteligência (JSON):
{formato}

Responda SOMENTE com JSON, sem texto antes nem depois: {{"resposta": "sua fala para o Davi", "config": <a inteligência inteira, já atualizada>}}.

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
- Você NÃO usa ferramentas e NÃO acessa arquivos: só responde com o texto da mensagem.

INTELIGÊNCIA DO AGENTE:
{config}

DADOS DO LEAD (simulado):
{contexto}

CONVERSA ATÉ AGORA:
{historico}

ÚLTIMA MENSAGEM DO LEAD:
{mensagem}

Responda apenas com o texto da mensagem do agente."""


def _historico(h):
    linhas = []
    for m in (h or [])[-12:]:
        quem = {"user": "Davi", "assistant": "Você", "lead": "Lead", "agente": "Agente"}.get(m.get("papel"), "?")
        linhas.append(f"- {quem}: {str(m.get('texto', ''))[:1500]}")
    return "\n".join(linhas) or "(começo)"


AJUSTE = """ATENÇÃO: a mensagem começa com [ajuste]. O Davi está te ENSINANDO algo para o agente aprender (uma correção ou uma regra nova, muitas vezes depois de testar o agente).
Incorpore na inteligência agora, no lugar certo (pode, nao_pode, tom, etapas, objecoes, perfis, chamar_humano ou extras), mantendo o resto. Escreva a regra de forma clara e geral, não só para este caso.
Responda em 1 ou 2 frases dizendo o que você gravou e onde. Não faça pergunta a menos que seja impossível entender.
"""


def _prompt(p):
    base = dict(quiz_id=p["contexto"].get("quiz_id", ""), cliente_id=p["cliente_id"], config=json.dumps(p["config_atual"], ensure_ascii=False), contexto=json.dumps(p["contexto"], ensure_ascii=False),
                historico=_historico(p["historico"]), mensagem=p["mensagem"])
    if p["tipo"] == "simular":
        if p["contexto"].get("iniciar"):
            # Zerou o teste: o agente abre a conversa, como faria ao abordar o lead (que ainda não escreveu nada).
            base["mensagem"] = "(o lead ainda não escreveu nada: é VOCÊ quem começa a conversa, com a mensagem de abordagem inicial, usando o que sabe do lead e do quiz)"
        return PROMPT_SIMULAR.format(**base)
    ajuste = p["mensagem"].lstrip().lower().startswith("[ajuste]")
    return PROMPT_CONSTRUIR.format(formato=FORMATO, modo_ajuste=AJUSTE if ajuste else "", **base)


def extrair(texto):
    """(resposta, config|None). Se o Claude só conversou (sem JSON válido), devolve o texto e config None."""
    try:
        i, f = texto.find("{"), texto.rfind("}")
        d = json.loads(texto[i:f + 1])
        if isinstance(d.get("config"), dict):
            return str(d.get("resposta") or "Pronto, atualizei a inteligência."), d["config"]
        if isinstance(d.get("resposta"), str):
            return d["resposta"], None
    except (ValueError, TypeError):
        pass
    return texto.strip(), None


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
        if p["tipo"] == "simular":
            ok, texto = rodar_claude(_prompt(p), minutos=4, turnos=3, ferramentas=["Read"])
        else:   # montar: pode consultar o quiz, o banco (só leitura) e a internet
            ok, texto = rodar_claude(_prompt(p), minutos=12, turnos=30, ferramentas=["Bash(python3 scripts/consulta.py:*)", "Read", "Grep", "Glob", "WebFetch", "WebSearch"])
        if not ok or not texto.strip():
            q.execute("UPDATE public.agente_whatsapp_pedidos SET status='erro', erro=%s, respondido_em=now() WHERE id=%s", ((texto or "sem resposta")[:300], p["id"]))
            log("agente: erro —", (texto or "")[:120])
        elif p["tipo"] == "simular":
            q.execute("UPDATE public.agente_whatsapp_pedidos SET status='respondido', resposta=%s, respondido_em=now() WHERE id=%s", (texto.strip(), p["id"]))
            log("agente: simulação respondida")
        else:
            resposta, config = extrair(texto)
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
