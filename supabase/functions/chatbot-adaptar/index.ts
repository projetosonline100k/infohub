import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Assistente do Chatbot (10/11/2026, Davi: "um chat onde eu jogo as mensagens e você já adapta para o chatbot").
// Recebe o texto colado (roteiro, mensagens, perguntas) + o chatbot atual e devolve o chatbot inteiro já ajustado.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SISTEMA = `Você adapta conteúdo para um chatbot de diagnóstico em conversa (estilo WhatsApp), que qualifica leads do Instagram.
Você recebe o chatbot atual (JSON) e o pedido/mensagens do usuário, e devolve o chatbot COMPLETO já ajustado.

Formato do chatbot (JSON):
{
 "marca": {"titulo": string, "subtitulo"?: string, "cor"?: "#rrggbb", "avatar_url"?: string, "logo_url"?: string},
 "pontuacao": {"minimo": number},
 "lgpd"?: string,
 "etapas": [{
   "id": string (mantenha o id das etapas que já existem; invente um curto para as novas),
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
Responda SOMENTE com JSON: {"resposta": "uma frase curta dizendo o que você fez", "config": <chatbot completo>}.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { mensagem, config, historico } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = req.headers.get("Authorization");
    if (!authorization || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: corsHeaders });
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (typeof mensagem !== "string" || !mensagem.trim() || mensagem.length > 30000 || typeof config !== "object" || !config) {
      return new Response(JSON.stringify({ error: "Pedido inválido" }), { status: 400, headers: corsHeaders });
    }

    const conversa = (Array.isArray(historico) ? historico : []).slice(-6)
      .filter((m: { papel?: string; texto?: string }) => (m.papel === "user" || m.papel === "assistant") && typeof m.texto === "string")
      .map((m: { papel: string; texto: string }) => ({ role: m.papel, content: m.texto.slice(0, 2000) }));
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SISTEMA },
          ...conversa,
          { role: "user", content: `CHATBOT ATUAL:\n${JSON.stringify(config)}\n\nPEDIDO / MENSAGENS DO USUÁRIO:\n${mensagem}` },
        ],
      }),
    });
    if (!response.ok) {
      const status = response.status === 429 || response.status === 402 ? response.status : 502;
      return new Response(JSON.stringify({ error: status === 429 ? "Muitos pedidos, tente de novo em instantes." : status === 402 ? "Sem créditos de IA." : "A IA não respondeu." }), { status, headers: corsHeaders });
    }
    const data = await response.json();
    const texto: string = data.choices?.[0]?.message?.content ?? "";
    let saida: { resposta?: string; config?: unknown };
    try { saida = JSON.parse(texto.replace(/^```json\s*|\s*```$/g, "")); } catch { return new Response(JSON.stringify({ error: "A IA devolveu algo que não consegui ler. Tente de novo." }), { status: 502, headers: corsHeaders }); }
    return new Response(JSON.stringify({ resposta: saida.resposta ?? "Pronto.", config: saida.config }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Erro ao adaptar o chatbot" }), { status: 500, headers: corsHeaders });
  }
});
