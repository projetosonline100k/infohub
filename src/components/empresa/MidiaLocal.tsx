import { useEffect, useState } from "react";
import { FileWarning, Loader2 } from "lucide-react";
import { isDesktop } from "@/lib/platform";
import type { MidiaChat } from "@/lib/empresa/midiasChat";

// Mostra no chat uma imagem, vídeo ou áudio que o Lauro salvou no Mac (12/11/2026, Davi: "preciso que eu consiga ver o vídeo e as imagens que ele vai gerar").
// Só no app do Mac: o arquivo mora em ~/.infopro-hub e é lido pelo comando ler_midia_local (que não sai dessa pasta).
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export function MidiaLocal({ midia, grande = false }: { midia: MidiaChat; grande?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!isDesktop()) { setErro("Abra no app do Mac para ver"); return; }
    let vivo = true;
    let criada: string | null = null;
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dados = await invoke<ArrayBuffer>("ler_midia_local", { caminho: midia.caminho });
        if (!vivo) return;
        const ext = midia.nome.split(".").pop()?.toLowerCase() ?? "";
        criada = URL.createObjectURL(new Blob([dados], { type: MIME[ext] ?? "application/octet-stream" }));
        setUrl(criada);
      } catch (e) { if (vivo) setErro(typeof e === "string" ? e : "Não consegui abrir o arquivo"); }
    })();
    return () => { vivo = false; if (criada) URL.revokeObjectURL(criada); };
  }, [midia.caminho, midia.nome]);

  return (
    <figure className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {erro ? <p className="flex items-center gap-2 p-3 text-xs text-white/50"><FileWarning className="h-4 w-4 shrink-0" />{midia.nome}: {erro}</p>
        : !url ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
        : midia.tipo === "audio" ? <audio src={url} controls preload="metadata" className="w-full p-2" />
        : midia.tipo === "video" ? <video src={url} controls playsInline preload="metadata" className={grande ? "mx-auto max-h-[60vh] w-auto max-w-full bg-black" : "max-h-[420px] w-full bg-black"} />
        : <img src={url} alt={midia.nome} className="max-h-[420px] w-full object-contain" />}
      <figcaption className="truncate px-2 py-1 text-[10px] text-white/40" title={midia.caminho}>{midia.nome}</figcaption>
    </figure>
  );
}
