import { useCallback, useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from "@tiptap/react";
import { Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { cn } from "@/lib/utils";

// Áudio gravado dentro do documento (18/10/2026, Davi: "em vez de só ficar piscando um |, quero
// ao lado um microfone; ao clicar, gravar um áudio já com a transcrição; ouvir, acelerar,
// clicar na parte específica do áudio"). O microfone aparece ao lado do cursor numa linha vazia;
// o áudio vai para o Storage (audios-documentos) e o Whisper do Mac devolve os trechos com o
// tempo (voz_transcrever_trechos). O bloco guarda a URL e os trechos no próprio documento.

export interface TrechoAudio { inicio: number; fim: number; texto: string }

export const AudioGravado = Node.create({
  name: "audioGravado",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute("data-id"), renderHTML: (a) => (a.id ? { "data-id": a.id } : {}) },
      src: { default: null, parseHTML: (el) => el.getAttribute("data-src"), renderHTML: (a) => (a.src ? { "data-src": a.src } : {}) },
      estado: { default: "pronto", parseHTML: (el) => el.getAttribute("data-estado") || "pronto", renderHTML: (a) => ({ "data-estado": a.estado }) },
      trechos: {
        default: [],
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute("data-trechos") || "[]"); } catch { return []; } },
        renderHTML: (a) => ({ "data-trechos": JSON.stringify(a.trechos ?? []) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-audio-gravado]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    // O texto vai junto no HTML: quem lê o documento como texto (busca, Danilo, Claude) vê a fala.
    const texto = ((node.attrs.trechos ?? []) as TrechoAudio[]).map((t) => t.texto).join(" ") || "Áudio";
    return ["div", mergeAttributes(HTMLAttributes, { "data-audio-gravado": "" }), `🎙️ ${texto}`];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PlayerAudio);
  },
});

const VELOCIDADES = [1, 1.25, 1.5, 2];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function PlayerAudio({ node, deleteNode }: NodeViewProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [agora, setAgora] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [vel, setVel] = useState(1);
  const trechos = (node.attrs.trechos ?? []) as TrechoAudio[];
  const estado = node.attrs.estado as string;

  const pular = (t: number, tocar = true) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = t;
    if (tocar) void a.play();
  };

  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      <div contentEditable={false} className="rounded-xl border bg-muted/40 p-3 not-prose select-none">
        {estado === "erro" ? (
          <p className="flex items-center gap-2 text-sm text-rose-600">
            Não consegui guardar este áudio.
            <button type="button" onClick={() => deleteNode()} className="underline">Apagar</button>
          </p>
        ) : estado !== "pronto" || !node.attrs.src ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />{estado === "enviando" ? "Guardando o áudio e transcrevendo…" : "Preparando o áudio…"}
          </p>
        ) : (
          <>
            <audio ref={audio} src={node.attrs.src} preload="metadata"
              onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration || 0)} onTimeUpdate={(e) => setAgora(e.currentTarget.currentTime)}
              onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => setTocando(false)} />
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => { const a = audio.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90">
                {tocando ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              {/* Barra: clica para pular para aquele ponto. */}
              <div className="relative h-2 flex-1 cursor-pointer rounded-full bg-muted-foreground/20"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (duracao) pular(((e.clientX - r.left) / r.width) * duracao, false); }}>
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${duracao ? (agora / duracao) * 100 : 0}%` }} />
              </div>
              <span className="w-[74px] shrink-0 text-right text-xs tabular-nums text-muted-foreground">{mmss(agora)} / {mmss(duracao)}</span>
              <button type="button" title="Velocidade" onClick={() => {
                const prox = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length];
                setVel(prox);
                if (audio.current) audio.current.playbackRate = prox;
              }} className="w-12 shrink-0 rounded-md border px-1.5 py-1 text-xs font-semibold hover:bg-muted">{String(vel).replace(".", ",")}x</button>
              <button type="button" title="Apagar o áudio" onClick={() => deleteNode()} className="shrink-0 text-muted-foreground hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {trechos.length > 0 && (
              <p className="mt-2.5 text-[14px] leading-relaxed">
                {trechos.map((t, i) => {
                  const ativo = agora >= t.inicio && agora < (trechos[i + 1]?.inicio ?? t.fim + 0.5);
                  return (
                    <span key={i} title={`Ir para ${mmss(t.inicio)}`} onClick={() => pular(t.inicio)}
                      className={cn("cursor-pointer rounded px-0.5 transition-colors hover:bg-primary/15", ativo && tocando && "bg-primary/25")}>
                      {t.texto}{" "}
                    </span>
                  );
                })}
              </p>
            )}
            {trechos.length === 0 && !isDesktop() && <p className="mt-2 text-xs text-muted-foreground">A transcrição sai quando o áudio é gravado pelo app do Mac.</p>}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------- Microfone ao lado do cursor

const paraBase64 = (blob: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => erro(r.error);
  r.readAsDataURL(blob);
});

/** Acha o bloco de áudio pelo id e troca os atributos (ele pode ter mudado de lugar). */
function atualizarBloco(editor: Editor, id: string, attrs: Record<string, unknown>) {
  if (editor.isDestroyed) return;
  let pos: number | null = null;
  editor.state.doc.descendants((n, p) => {
    if (pos === null && n.type.name === "audioGravado" && n.attrs.id === id) { pos = p; return false; }
    return pos === null;
  });
  if (pos === null) return;
  const no = editor.state.doc.nodeAt(pos);
  if (no) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...no.attrs, ...attrs }));
}

export function MicrofoneNoCursor({ editor }: { editor: Editor }) {
  const [onde, setOnde] = useState<{ left: number; top: number } | null>(null);
  const [gravando, setGravando] = useState<{ desde: number } | null>(null);
  const [, setTique] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const posInicio = useRef(0);

  // Mostra o microfone quando o cursor está numa linha vazia do documento.
  const medir = useCallback(() => {
    if (gravador.current) return;
    const { state, view } = editor;
    const { selection } = state;
    const vazio = selection.empty && selection.$from.parent.type.name === "paragraph" && selection.$from.parent.content.size === 0;
    if (!editor.isFocused || !vazio) { setOnde(null); return; }
    try {
      const c = view.coordsAtPos(selection.from);
      setOnde({ left: c.left + 10, top: c.top + (c.bottom - c.top) / 2 });
    } catch { setOnde(null); }
  }, [editor]);

  useEffect(() => {
    const aoMudar = () => medir();
    const aoSair = () => window.setTimeout(medir, 120);
    editor.on("selectionUpdate", aoMudar);
    editor.on("update", aoMudar);
    editor.on("focus", aoMudar);
    editor.on("blur", aoSair);
    window.addEventListener("scroll", aoMudar, true);
    window.addEventListener("resize", aoMudar);
    return () => {
      editor.off("selectionUpdate", aoMudar); editor.off("update", aoMudar); editor.off("focus", aoMudar); editor.off("blur", aoSair);
      window.removeEventListener("scroll", aoMudar, true);
      window.removeEventListener("resize", aoMudar);
    };
  }, [editor, medir]);

  useEffect(() => {
    if (!gravando) return;
    const t = window.setInterval(() => setTique((x) => x + 1), 500);
    return () => window.clearInterval(t);
  }, [gravando]);

  const terminar = useCallback(async (audio: Blob) => {
    const id = crypto.randomUUID();
    // O bloco entra já, no lugar onde a gravação começou, girando até ficar pronto.
    const pos = Math.min(posInicio.current, editor.state.doc.content.size);
    editor.chain().insertContentAt(pos, { type: "audioGravado", attrs: { id, estado: "enviando", trechos: [] } }).run();
    try {
      const ext = audio.type.includes("webm") ? "webm" : "m4a";
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("sem login");
      const caminho = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
      const [envio, transcricao] = await Promise.all([
        supabase.storage.from("audios-documentos").upload(caminho, audio, { contentType: audio.type || "audio/mp4" }),
        isDesktop()
          ? import("@tauri-apps/api/core").then(async ({ invoke }) => invoke<{ trechos?: TrechoAudio[] }>("voz_transcrever_trechos", { base64: await paraBase64(audio), extensao: ext })).catch(() => ({ trechos: [] }))
          : Promise.resolve({ trechos: [] as TrechoAudio[] }),
      ]);
      if (envio.error) throw envio.error;
      const src = supabase.storage.from("audios-documentos").getPublicUrl(caminho).data.publicUrl;
      atualizarBloco(editor, id, { src, estado: "pronto", trechos: transcricao.trechos ?? [] });
    } catch (e) {
      toast.error(`Não consegui guardar o áudio: ${e instanceof Error ? e.message : String(e)}`);
      atualizarBloco(editor, id, { estado: "erro" });
    }
  }, [editor]);

  const alternar = async () => {
    if (gravador.current) { gravador.current.stop(); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast.error("Sem acesso ao microfone"); return; }
    posInicio.current = editor.state.selection.from;
    const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      gravador.current = null;
      setGravando(null);
      const audio = new Blob(partes, { type: (rec.mimeType || "audio/mp4").split(";")[0] });
      if (audio.size > 2000) void terminar(audio);
      setOnde(null);
    };
    gravador.current = rec;
    rec.start();
    setGravando({ desde: Date.now() });
  };

  if (!onde && !gravando) return null;
  const seg = gravando ? Math.floor((Date.now() - gravando.desde) / 1000) : 0;
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void alternar()}
      title={gravando ? "Parar e transcrever" : "Gravar um áudio aqui (com transcrição)"}
      style={onde ? { left: onde.left, top: onde.top } : undefined}
      className={cn("fixed z-50 flex -translate-y-1/2 items-center gap-1.5 rounded-full border shadow-sm transition",
        gravando ? "bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white" : "h-7 w-7 justify-center bg-background text-muted-foreground hover:bg-primary hover:text-primary-foreground",
        !onde && "bottom-6 right-24 top-auto translate-y-0")}>
      {gravando ? <><span className="h-2 w-2 animate-pulse rounded-full bg-white" />{mmss(seg)}<Square className="h-3 w-3 fill-current" /></> : <Mic className="h-3.5 w-3.5" />}
    </button>
  );
}
