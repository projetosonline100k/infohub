"""Assistente do Chatbot (10/11/2026, Davi: "vincular ao uso daqui mesmo", sem chave de API).

O app grava o pedido em public.chatbot_pedidos (pendente). O ouvinte do Atlas chama `atender(rodar_claude)` num laço:
pega um pedido, pede ao Claude (plano do Davi, `claude -p`) o chatbot inteiro já ajustado e grava a resposta;
o app (aba Chatbot → Assistente) lê o resultado e aplica. O Claude NÃO mexe em arquivo nem no banco: só devolve JSON.
"""
import json
from migration_db import connect

SISTEMA = """Você adapta conteúdo para um chatbot de diagnóstico em conversa (estilo WhatsApp), que qualifica leads do Instagram.
Você recebe o chatbot atual (JSON) e o pedido/mensagens do usuário, e devolve o chatbot COMPLETO já ajustado.

Formato do chatbot (JSON):
{
 "marca": {"titulo": string, "subtitulo"?: string, "cor"?: "#rrggbb"},
 "pontuacao": {"minimo": number},
 "lgpd"?: string,
 "etapas": [{
   "id": string (mantenha o id das etapas que já existem; invente um curto, só letras e números, para as novas),
   "chave": string (minúsculas, sem espaço; ex.: nome, whatsapp, email, instagram, seguidores, nicho, desafio, faturamento),
   "tipo": "nenhum" | "texto" | "whatsapp" | "email" | "escolha" | "lista",
   "mensagens": [string] (cada item é um balão do bot; pode usar {primeiro} para o primeiro nome, {chave} para outra resposta e **negrito**),
   "rotulo"?: string, "placeholder"?: string,
   "opcoes"?: [{"texto": string, "pontos": number}]   // só para "escolha" e "lista"
 }],
 "desfechos": {
   "qualificado": {"mensagens": [string], "botao_texto"?: string, "botao_url"?: string},
   "nao_qualificado": {"mensagens": [string], "botao_texto"?: string, "botao_url"?: string}
 }
}

Regras:
- "nenhum" = o bot só fala e segue (sem pedir resposta). "texto" = campo livre. "escolha" = botões. "lista" = select (muitas opções).
- Cada pergunta ao lead vira uma etapa; as falas antes dela ficam em "mensagens" da própria etapa. Mensagens curtas, tom de conversa, português do Brasil.
- Pontos: dê pontos maiores às respostas que indicam lead mais valioso (mais seguidores, mais renda). "pontuacao.minimo" é a nota a partir da qual o lead é "qualificado"; ajuste para que faça sentido com os pontos máximos.
- Mantenha tudo que o usuário não pediu para mudar. Se ele colar um roteiro/mensagens, monte as etapas na ordem do texto, preservando as palavras dele ao máximo.
- Nunca invente links, preços ou promessas: deixe "botao_url" vazio se não foi informado.
- Você NÃO usa ferramentas, NÃO lê nem escreve arquivos e NÃO acessa o banco: só responde.
Responda SOMENTE com JSON, sem texto antes nem depois: {"resposta": "uma frase curta dizendo o que você fez", "config": <chatbot completo>}."""


def _prompt(p):
    historico = ""
    for m in (p["historico"] or [])[-6:]:
        quem = "Usuário" if m.get("papel") == "user" else "Você"
        historico += f"- {quem}: {str(m.get('texto', ''))[:1500]}\n"
    return (f"{SISTEMA}\n\n"
            f"CONVERSA ATÉ AGORA:\n{historico or '(começo)'}\n"
            f"CHATBOT ATUAL:\n{json.dumps(p['config_atual'], ensure_ascii=False)}\n\n"
            f"PEDIDO / MENSAGENS DO USUÁRIO:\n{p['mensagem']}")


def extrair(texto):
    """O primeiro objeto JSON da resposta do Claude (ele às vezes põe ``` em volta)."""
    i, f = texto.find("{"), texto.rfind("}")
    if i < 0 or f <= i:
        raise ValueError("sem JSON")
    d = json.loads(texto[i:f + 1])
    if not isinstance(d.get("config"), dict) or not isinstance(d["config"].get("etapas"), list):
        raise ValueError("sem config.etapas")
    return str(d.get("resposta") or "Pronto, já ajustei."), d["config"]


def atender(rodar_claude, log=print):
    """Atende UM pedido pendente (se houver). `rodar_claude(prompt, minutos, ...)` vem do ouvinte."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.chatbot_pedidos SET status = 'processando'
                     WHERE id = (SELECT id FROM public.chatbot_pedidos WHERE status = 'pendente'
                                 ORDER BY criado_em LIMIT 1 FOR UPDATE SKIP LOCKED)
                     RETURNING id, mensagem, config_atual, historico""")
        linha = q.fetchone()
        c.commit()
        if not linha:
            return
        p = {"id": linha[0], "mensagem": linha[1], "config_atual": linha[2], "historico": linha[3]}
        log("chatbot: pedido", str(p["id"])[:8], f"({len(p['mensagem'])} caracteres)")
        ok, texto = rodar_claude(_prompt(p), minutos=6, turnos=3, ferramentas=["Read"])
        try:
            if not ok:
                raise ValueError(texto)
            resposta, config = extrair(texto)
            q.execute("UPDATE public.chatbot_pedidos SET status='respondido', resposta=%s, config=%s::jsonb, respondido_em=now() WHERE id=%s",
                      (resposta, json.dumps(config, ensure_ascii=False), p["id"]))
            log("chatbot: respondido")
        except Exception as e:
            motivo = str(e)[:300] if ok is False else f"o Claude respondeu algo que não consegui ler ({str(e)[:80]})"
            q.execute("UPDATE public.chatbot_pedidos SET status='erro', erro=%s, respondido_em=now() WHERE id=%s", (motivo, p["id"]))
            log("chatbot: erro —", motivo)
        c.commit()
    finally:
        c.close()


def reenfileirar():
    """No início do ouvinte: pedido que ficou 'processando' (o ouvinte reiniciou no meio) volta para a fila."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.chatbot_pedidos SET status='pendente' WHERE status='processando' AND criado_em > now() - interval '10 minutes'")
        n = q.rowcount
        c.commit()
        return n
    finally:
        c.close()
