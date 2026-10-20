import { useEffect, useRef, useState } from "react";
import { MessageCircle, Inbox, AlertTriangle, MessagesSquare, X } from "lucide-react";

// Janelinha de aviso do Atlas no canto de cima da tela (20/10: "notificação mais bonita, com o
// símbolo do Infopro e do Atlas; WhatsApp verde"). Aberta por mostrarAviso (desktop/notificacao.ts)
// com tudo na URL; clicar avisa a janela do Atlas ("aviso-clicado") para ela fazer a ação.
type Tipo = "whatsapp" | "revisar" | "resposta" | "urgente";

const ESTILO: Record<Tipo, { cor: string; brilho: string; Icone: typeof MessageCircle; rotulo: string }> = {
  whatsapp: { cor: "#25D366", brilho: "rgba(37,211,102,0.35)", Icone: MessageCircle, rotulo: "WhatsApp" },
  revisar: { cor: "#34D399", brilho: "rgba(52,211,153,0.30)", Icone: Inbox, rotulo: "Para revisar" },
  resposta: { cor: "#38BDF8", brilho: "rgba(56,189,248,0.30)", Icone: MessagesSquare, rotulo: "Resposta" },
  urgente: { cor: "#F43F5E", brilho: "rgba(244,63,94,0.35)", Icone: AlertTriangle, rotulo: "Urgente" },
};
const DURACAO_MS = 9000;

export default function AvisoWindow() {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("id") ?? "";
  const tipo = (p.get("k") as Tipo) in ESTILO ? (p.get("k") as Tipo) : "revisar";
  const { cor, brilho, Icone, rotulo } = ESTILO[tipo];
  const [saindo, setSaindo] = useState(false);
  const parado = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add("jarvis-window");
  }, []);

  const fechar = async () => {
    setSaindo(true);
    setTimeout(async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      } catch { /* web */ }
    }, 220);
  };

  useEffect(() => {
    const t = setInterval(() => { if (!parado.current) void fechar(); }, DURACAO_MS);
    return () => clearInterval(t);
  }, []);

  const abrir = async () => {
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("aviso-clicado", { id });
    } catch { /* web */ }
    void fechar();
  };

  return (
    <div className="flex h-screen w-screen items-start justify-end p-1.5">
      <div
        role="button" tabIndex={0} onClick={() => void abrir()}
        onMouseEnter={() => { parado.current = true; }} onMouseLeave={() => { parado.current = false; }}
        className={`group relative flex w-full cursor-pointer gap-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1620]/95 p-3 pr-8 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 ${saindo ? "translate-x-8 opacity-0" : "animate-in slide-in-from-right-8 fade-in-0"}`}
        style={{ boxShadow: `0 10px 30px -8px ${brilho}, 0 0 0 1px rgba(255,255,255,0.04)` }}
      >
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor }} />
        {/* Orbe do Atlas com o selo do tipo do aviso */}
        <span className="relative mt-0.5 ml-1 h-11 w-11 shrink-0">
          <span className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-700 to-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.55)] ring-1 ring-cyan-300/40" />
          <span className="absolute left-[13px] top-[16px] h-[11px] w-[6px] rounded-full bg-cyan-200 shadow-[0_0_6px_rgba(165,243,252,0.9)]" />
          <span className="absolute right-[13px] top-[16px] h-[11px] w-[6px] rounded-full bg-cyan-200 shadow-[0_0_6px_rgba(165,243,252,0.9)]" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[#0d1620]" style={{ background: cor }}>
            <Icone className="h-3 w-3 text-white" strokeWidth={2.6} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-white/50">
            <img src="/logo.png" alt="" className="h-3.5 w-3.5 rounded-[4px]" />
            Infopro · Atlas
            <span className="font-semibold normal-case tracking-normal" style={{ color: cor }}>· {rotulo}</span>
          </span>
          <span className="mt-0.5 block truncate text-[13.5px] font-semibold leading-snug">{p.get("t")}</span>
          {p.get("q") && <span className="block truncate text-[11.5px] text-white/60">{p.get("q")}</span>}
          {p.get("c") && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-white/80">{p.get("c")}</span>}
        </span>
        <button type="button" aria-label="Fechar" onClick={(e) => { e.stopPropagation(); void fechar(); }}
          className="absolute right-2 top-2 rounded-full p-1 text-white/40 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
