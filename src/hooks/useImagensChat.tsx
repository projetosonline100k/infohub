import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PREFIXO_IMAGEM, audiosDoEvento, ehAudio, imagensDoEvento, subirImagemChat } from "@/lib/empresa/imagemChat";
import { isDesktop } from "@/lib/platform";
import { receberImagensSoltas } from "@/lib/desktop/soltarImagem";

// Colar (⌘V) ou arrastar print no chat dos funcionários (22/10). As imagens sobem na hora e ficam
// esperando o envio, em miniatura em cima do campo; ao enviar, entram como linhas "🖼️ <link>".
// As props vão na conversa inteira (soltar em qualquer lugar dela) e o <Soltar /> mostra onde soltar.
export function useImagensChat() {
  const [imagens, setImagens] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(0);
  const [audios, setAudios] = useState<{ id: string; nome: string; texto: string }[]>([]);
  const [arrastando, setArrastando] = useState(false);

  // Áudio (19/11, Davi: arrastar a gravação para o Roy): transcreve no Mac (Whisper) e o texto vai na mensagem.
  const transcrever = async (a: File) => {
    if (!isDesktop()) { toast.error("Transcrever áudio só funciona no app do Mac"); return; }
    try {
      const bytes = new Uint8Array(await a.arrayBuffer());
      if (!bytes.length) throw new Error("o áudio chegou vazio");
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const { invoke } = await import("@tauri-apps/api/core");
      const extensao = (a.name.split(".").pop() || "m4a").toLowerCase();
      const texto = (await invoke<string>("voz_transcrever", { base64: btoa(bin), extensao })).replace(/\s+/g, " ").trim();
      if (!texto) throw new Error("não entendi nada do áudio");
      setAudios((xs) => [...xs, { id: crypto.randomUUID(), nome: a.name.replace(/\.[^.]+$/, ""), texto }]);
    } catch (e) { console.error("áudio do chat", e); toast.error("Não consegui transcrever o áudio", { description: e instanceof Error ? e.message : String(e) }); }
  };
  const subir = async (todos: File[]) => {
    if (!todos.length) return false;
    const arquivos = todos.filter((f) => !ehAudio(f));
    const sons = todos.filter(ehAudio);
    setSubindo((n) => n + todos.length);
    for (const a of sons) { try { await transcrever(a); } finally { setSubindo((n) => n - 1); } }
    for (const a of arquivos) {
      try { const url = await subirImagemChat(a); setImagens((xs) => [...xs, url]); }
      catch (e) { console.error("imagem do chat", e); toast.error("Não consegui subir a imagem", { description: e instanceof Error ? e.message : String(e) }); }
      finally { setSubindo((n) => n - 1); }
    }
    return true;
  };
  // No app do Mac quem recebe o arrasto é a janela (lib/desktop/soltarImagem); aqui só se inscreve.
  const [el, setEl] = useState<HTMLElement | null>(null);
  const subirRef = useRef(subir);
  subirRef.current = subir;
  useEffect(() => (el ? receberImagensSoltas(el, setArrastando, (fs) => { void subirRef.current(fs); }) : undefined), [el]);
  const props = {
    ref: setEl,
    onPaste: (e: React.ClipboardEvent) => { const fs = imagensDoEvento(e.clipboardData); if (fs.length) { e.preventDefault(); void subir(fs); } },
    // Qualquer arrasto de arquivo (no app do Mac o tipo da imagem às vezes só aparece ao soltar).
    onDragOver: (e: React.DragEvent) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setArrastando(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); },
    onDrop: (e: React.DragEvent) => { setArrastando(false); const fs = [...imagensDoEvento(e.dataTransfer), ...audiosDoEvento(e.dataTransfer)]; if (fs.length) { e.preventDefault(); void subir(fs); } },
  };
  const comImagens = (texto: string) => {
    const linhas = [...imagens.map((u) => `${PREFIXO_IMAGEM}${u}`), ...audios.map((a) => `🎙️ [áudio "${a.nome}"] ${a.texto}`)];
    return linhas.length ? `${linhas.join("\n")}${texto ? `\n${texto}` : ""}` : texto;
  };
  const Pendentes = () => (imagens.length || audios.length || subindo ? (
    <div className="flex flex-wrap gap-1.5 px-2 pt-2">
      {audios.map((a) => (
        <span key={a.id} className="relative flex h-14 max-w-[11rem] items-center rounded-md border bg-muted/40 px-2 text-[11px] leading-tight">
          <span className="line-clamp-3">🎙️ {a.nome}: {a.texto}</span>
          <button type="button" onClick={() => setAudios((xs) => xs.filter((x) => x.id !== a.id))} aria-label="Tirar o áudio"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background"><X className="h-3 w-3" /></button>
        </span>
      ))}
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
      Solte o print ou o áudio aqui
    </div>
  ) : null);
  return { imagens, audios, subindo, subir, arrastando, props, comImagens, limpar: () => { setImagens([]); setAudios([]); }, Pendentes, Soltar };
}
