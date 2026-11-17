import { useEffect, useRef, useState } from "react";
import { FileWarning, Loader2, Play } from "lucide-react";
import { isDesktop } from "@/lib/platform";
import type { MidiaChat } from "@/lib/empresa/midiasChat";

// Mostra no chat uma imagem, vídeo ou áudio que o Lauro salvou no Mac (12/11/2026, Davi: "preciso que eu consiga ver o vídeo e as imagens que ele vai gerar").
// Só no app do Mac: o arquivo mora em ~/.infopro-hub e é lido pelo comando ler_midia_local (que não sai dessa pasta).
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

// O chat do Lauro guarda dezenas de mensagens com mídia: carregar tudo de uma vez (vídeos inteiros via invoke) travava o app
// (17/11/2026, Davi: "o chat do Lauro está bem travado"). Agora a imagem só carrega quando aparece na tela, e vídeo/áudio só
// depois de um clique (exceto o player grande da tela do roteiro). Imagens já lidas ficam em cache.
const CACHE_IMG = new Map<string, string>();

export function MidiaLocal({ midia, grande = false }: { midia: MidiaChat; grande?: boolean }) {
  const [url, setUrl] = useState<string | null>(() => CACHE_IMG.get(midia.caminho) ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const pesado = midia.tipo !== "imagem" && !grande;
  const [liberado, setLiberado] = useState(!pesado);
  const [visivel, setVisivel] = useState(!!url || grande);
  const caixa = useRef<HTMLElement>(null);
  useEffect(() => {
    if (visivel || !caixa.current) return;
    const obs = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVisivel(true); obs.disconnect(); } }, { rootMargin: "200px" });
    obs.observe(caixa.current);
    return () => obs.disconnect();
  }, [visivel]);
  useEffect(() => {
    if (!isDesktop()) { setErro("Abra no app do Mac para ver"); return; }
    if (!visivel || !liberado || url) return;
    let vivo = true;
    let criada: string | null = null;
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dados = await invoke<ArrayBuffer>("ler_midia_local", { caminho: midia.caminho });
        if (!vivo) return;
        const ext = midia.nome.split(".").pop()?.toLowerCase() ?? "";
        criada = URL.createObjectURL(new Blob([dados], { type: MIME[ext] ?? "application/octet-stream" }));
        if (midia.tipo === "imagem") CACHE_IMG.set(midia.caminho, criada);
        setUrl(criada);
      } catch (e) { if (vivo) setErro(typeof e === "string" ? e : "Não consegui abrir o arquivo"); }
    })();
    return () => { vivo = false; if (criada && midia.tipo !== "imagem") URL.revokeObjectURL(criada); };
  }, [midia.caminho, midia.nome, visivel, liberado]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure ref={caixa as React.RefObject<HTMLElement>} className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {erro ? <p className="flex items-center gap-2 p-3 text-xs text-white/50"><FileWarning className="h-4 w-4 shrink-0" />{midia.nome}: {erro}</p>
        : !liberado ? <button type="button" onClick={() => setLiberado(true)} className="flex h-20 w-full items-center justify-center gap-2 text-xs text-white/70 hover:bg-white/5"><Play className="h-4 w-4" />{midia.tipo === "video" ? "Carregar vídeo" : "Carregar áudio"}</button>
        : !url ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
        : midia.tipo === "audio" ? <audio src={url} controls preload="metadata" className="w-full p-2" />
        : midia.tipo === "video" ? <video src={url} controls playsInline preload="metadata" className={grande ? "mx-auto max-h-[60vh] w-auto max-w-full bg-black" : "max-h-[420px] w-full bg-black"} />
        : <img src={url} alt={midia.nome} className="max-h-[420px] w-full object-contain" />}
      <figcaption className="truncate px-2 py-1 text-[10px] text-white/40" title={midia.caminho}>{midia.nome}</figcaption>
    </figure>
  );
}
