import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PREFIXO_IMAGEM, imagensDoEvento, subirImagemChat } from "@/lib/empresa/imagemChat";

// Colar (⌘V) ou arrastar print no chat dos funcionários (22/10). As imagens sobem na hora e ficam
// esperando o envio, em miniatura em cima do campo; ao enviar, entram como linhas "🖼️ <link>".
// As props vão na conversa inteira (soltar em qualquer lugar dela) e o <Soltar /> mostra onde soltar.
export function useImagensChat() {
  const [imagens, setImagens] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(0);
  const [arrastando, setArrastando] = useState(false);

  const subir = async (arquivos: File[]) => {
    if (!arquivos.length) return false;
    setSubindo((n) => n + arquivos.length);
    for (const a of arquivos) {
      try { const url = await subirImagemChat(a); setImagens((xs) => [...xs, url]); }
      catch { toast.error("Não consegui subir a imagem"); }
      finally { setSubindo((n) => n - 1); }
    }
    return true;
  };
  const props = {
    onPaste: (e: React.ClipboardEvent) => { const fs = imagensDoEvento(e.clipboardData); if (fs.length) { e.preventDefault(); void subir(fs); } },
    // Qualquer arrasto de arquivo (no app do Mac o tipo da imagem às vezes só aparece ao soltar).
    onDragOver: (e: React.DragEvent) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setArrastando(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); },
    onDrop: (e: React.DragEvent) => { setArrastando(false); const fs = imagensDoEvento(e.dataTransfer); if (fs.length) { e.preventDefault(); void subir(fs); } },
  };
  const comImagens = (texto: string) => (imagens.length ? `${imagens.map((u) => `${PREFIXO_IMAGEM}${u}`).join("\n")}${texto ? `\n${texto}` : ""}` : texto);
  const Pendentes = () => (imagens.length || subindo ? (
    <div className="flex flex-wrap gap-1.5 px-2 pt-2">
      {imagens.map((u) => (
        <span key={u} className="relative">
          <img src={u} alt="" className="h-14 w-14 rounded-md border object-cover" />
          <button type="button" onClick={() => setImagens((xs) => xs.filter((x) => x !== u))} aria-label="Tirar a imagem"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background"><X className="h-3 w-3" /></button>
        </span>
      ))}
      {subindo > 0 && <span className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></span>}
    </div>
  ) : null);
  // Aviso por cima do chat enquanto arrasta (a área toda aceita o print, não só o campo de texto).
  const Soltar = () => (arrastando ? (
    <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary backdrop-blur-[1px]">
      Solte o print aqui
    </div>
  ) : null);
  return { imagens, subindo, arrastando, props, comImagens, limpar: () => setImagens([]), Pendentes, Soltar };
}
