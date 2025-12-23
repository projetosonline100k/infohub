import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context, agentConfig, agentId, selectedText } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Chat request received with", messages.length, "messages");
    console.log("Context:", context);
    console.log("Agent Config:", agentConfig);
    console.log("Agent ID:", agentId);

    // Fetch knowledge base for this agent if agentId is provided
    let conhecimentos: { nome: string; conteudo_extraido: string }[] = [];
    if (agentId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: knowledgeData, error: knowledgeError } = await supabase
        .from("conhecimentos_agente")
        .select("nome, conteudo_extraido")
        .eq("agente_id", agentId);
      
      if (!knowledgeError && knowledgeData) {
        conhecimentos = knowledgeData;
        console.log("Found", conhecimentos.length, "knowledge documents");
      }
    }

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

    // Add knowledge base context
    if (conhecimentos.length > 0) {
      systemPrompt += `\n\n=== BASE DE CONHECIMENTO ===\nVocê tem acesso aos seguintes documentos de referência. Use estas informações para enriquecer suas respostas quando relevante:\n`;
      
      for (const doc of conhecimentos) {
        // Limit each document to 10000 chars to avoid context overflow
        const conteudo = doc.conteudo_extraido?.slice(0, 10000) || "";
        systemPrompt += `\n--- ${doc.nome} ---\n${conteudo}\n`;
      }
      
      systemPrompt += `\n=== FIM DA BASE DE CONHECIMENTO ===\n`;
    }

    // Add context about current video
    if (context?.titulo) {
      systemPrompt += `\n\nO vídeo em questão tem o título: "${context.titulo}"`;
    }
    if (context?.descricao) {
      systemPrompt += `\nDescrição: "${context.descricao}"`;
    }

    // Add selected text context for contextual editing
    if (selectedText) {
      systemPrompt += `\n\n=== MODO DE EDIÇÃO ===
O usuário selecionou um trecho específico do roteiro para edição:
"${selectedText}"

IMPORTANTE: Quando o usuário pedir para modificar este trecho, responda APENAS com o texto modificado, sem explicações adicionais, sem o formato de roteiro completo. Apenas o novo texto que substituirá o trecho selecionado.
=== FIM DO MODO DE EDIÇÃO ===`;
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

    console.log("System prompt length:", systemPrompt.length);

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
