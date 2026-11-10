import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatbotPlayer } from "@/components/chatbot/ChatbotPlayer";
import { utmDaUrl, type ConfigChatbot } from "@/lib/chatbot/chatbot";

// /chatbot/<slug> — o chatbot publicado, aberto para qualquer pessoa (sem login). Cada resposta já grava o lead
// (RPC chatbot_salvar_lead), então quem sai no meio também fica registrado; a origem (UTM) vai junto.
export default function ChatbotPublico() {
  const { slug = "" } = useParams();
  const [bot, setBot] = useState<{ nome: string; config: ConfigChatbot } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const lead = useRef(crypto.randomUUID());
  const utm = useRef(utmDaUrl(window.location.search));

  useEffect(() => {
    void supabase.rpc("chatbot_publico" as never, { p_slug: slug } as never).then(({ data }) => {
      const b = data as { nome: string; config: ConfigChatbot } | null;
      setBot(b?.config?.etapas?.length ? b : null);
      setCarregando(false);
      if (b?.config?.marca?.titulo) document.title = b.config.marca.titulo;
    });
  }, [slug]);

  const salvar = useCallback((p: { dados: Record<string, string>; etapa: number; score: number; desfecho: string | null }) => {
    // .then(): o builder do Supabase só envia a chamada quando alguém consome o resultado
    void supabase.rpc("chatbot_salvar_lead" as never, {
      p_slug: slug, p_lead: lead.current, p_dados: p.dados, p_etapa: p.etapa, p_score: p.score, p_desfecho: p.desfecho, p_utm: utm.current,
    } as never).then(() => undefined);
  }, [slug]);

  if (carregando) return <div className="flex h-[100dvh] items-center justify-center bg-[#f7f7fb]"><Loader2 className="h-5 w-5 animate-spin text-neutral-400" /></div>;
  if (!bot) return <div className="flex h-[100dvh] items-center justify-center bg-[#f7f7fb] p-6 text-center text-sm text-neutral-500">Este diagnóstico não está disponível.</div>;
  return <div className="h-[100dvh]"><ChatbotPlayer config={bot.config} onProgresso={salvar} /></div>;
}
