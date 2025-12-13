import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context, agentConfig } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Chat request received with", messages.length, "messages");
    console.log("Context:", context);
    console.log("Agent Config:", agentConfig);

    // Build system prompt based on agent config
    let systemPrompt = `Você é um especialista em criação de roteiros para vídeos curtos (Reels, TikTok, Shorts). Seu papel é ajudar o usuário a criar roteiros envolventes e virais.`;

    // Apply agent customization if available
    if (agentConfig) {
      if (agentConfig.persona) {
        systemPrompt = agentConfig.persona;
      }
      
      if (agentConfig.tom_voz) {
        const tomDescricao: Record<string, string> = {
          informal: "Use um tom informal e descontraído, como se estivesse conversando com um amigo.",
          profissional: "Use um tom profissional e sério, com linguagem clara e direta.",
          tecnico: "Use um tom técnico e detalhado, com informações precisas.",
          divertido: "Use um tom divertido e animado, com energia e entusiasmo.",
          inspirador: "Use um tom inspirador e motivacional, que desperte emoções.",
        };
        systemPrompt += `\n\nTom de voz: ${tomDescricao[agentConfig.tom_voz] || agentConfig.tom_voz}`;
      }
      
      if (agentConfig.instrucoes) {
        systemPrompt += `\n\nInstruções específicas:\n${agentConfig.instrucoes}`;
      }
    }

    // Add context about current video
    if (context?.titulo) {
      systemPrompt += `\n\nO vídeo em questão tem o título: "${context.titulo}"`;
    }
    if (context?.descricao) {
      systemPrompt += `\nDescrição: "${context.descricao}"`;
    }

    // Add default formatting guidelines
    systemPrompt += `

Diretrizes para criar bons roteiros:
1. GANCHO FORTE nos primeiros 3 segundos - capture atenção imediatamente
2. Estrutura clara: Gancho → Problema → Solução → CTA
3. Linguagem direta e conversacional
4. Frases curtas e impactantes
5. CTA claro no final (seguir, curtir, comentar, salvar)

Quando o usuário pedir para gerar um roteiro, formate assim:
---
🎬 GANCHO (0-3s):
[Frase de abertura impactante]

📌 DESENVOLVIMENTO (3-30s):
[Conteúdo principal dividido em pontos]

🎯 CTA (final):
[Chamada para ação]
---

Seja criativo, direto e ajude a criar conteúdo que engaja!`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Streaming response back to client");

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
