import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LandpageRender, type EventoLandpage } from "@/components/landpage/LandpageRender";
import { utmDaUrl } from "@/lib/quiz/utm";
import type { ConfigLandpage } from "@/lib/landpage/landpage";

// /p/<slug> — a land page publicada, aberta para qualquer pessoa (sem login). Visita, play do vídeo e clique no botão entram por RPC.
export default function LandpagePublica() {
  const { slug = "" } = useParams();
  const [pagina, setPagina] = useState<{ nome: string; config: ConfigLandpage } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const sessao = useRef(crypto.randomUUID());
  const utm = useRef(utmDaUrl(window.location.search));

  const evento = useCallback((tipo: "visita" | EventoLandpage) => {
    // .then(): o builder do Supabase só envia a chamada quando alguém consome o resultado
    void supabase.rpc("landpage_evento" as never, { p_slug: slug, p_sessao: sessao.current, p_tipo: tipo, p_utm: utm.current } as never).then(() => undefined);
  }, [slug]);

  useEffect(() => {
    void supabase.rpc("landpage_publica" as never, { p_slug: slug } as never).then(({ data }) => {
      const p = data as { nome: string; config: ConfigLandpage } | null;
      setPagina(p?.config?.blocos?.length ? p : null);
      setCarregando(false);
      if (p?.nome) document.title = p.nome;
      if (p?.config?.blocos?.length) evento("visita");
    });
  }, [slug, evento]);

  if (carregando) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b0b0f]"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>;
  if (!pagina) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b0b0f] p-6 text-center text-sm text-white/60">Esta página não está disponível.</div>;
  return <div className={pagina.config.escuro === false ? "min-h-[100dvh] bg-white" : "min-h-[100dvh] bg-[#0b0b0f]"}><LandpageRender config={pagina.config} utm={utm.current} onEvento={evento} className="max-w-5xl" /></div>;
}
