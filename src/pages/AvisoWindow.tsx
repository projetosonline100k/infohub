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
    document.documentElement.style.overflow = "hidden";   // nunca barra de rolagem no aviso
    document.body.style.overflow = "hidden";
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

  // 20/10 (Davi: "preciso bater o olho e entender"): só duas linhas curtas, sem rolagem.
  return (
    <div className="flex h-screen w-screen items-start justify-end overflow-hidden p-1.5">
      <div
        role="button" tabIndex={0} onClick={() => void abrir()}
        onMouseEnter={() => { parado.current = true; }} onMouseLeave={() => { parado.current = false; }}
        className={`group relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1620]/95 py-2.5 pl-3.5 pr-8 text-white backdrop-blur-xl transition-all duration-300 ${saindo ? "translate-x-8 opacity-0" : "animate-in slide-in-from-right-8 fade-in-0"}`}
        style={{ boxShadow: `0 6px 20px -6px ${brilho}` }}
        title={rotulo}
      >
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor }} />
        {/* Orbe do Atlas com o selo do tipo */}
        <span className="relative h-9 w-9 shrink-0">
          <span className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-700 to-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.5)] ring-1 ring-cyan-300/40" />
          <span className="absolute left-[11px] top-[13px] h-[9px] w-[5px] rounded-full bg-cyan-200 shadow-[0_0_5px_rgba(165,243,252,0.9)]" />
          <span className="absolute right-[11px] top-[13px] h-[9px] w-[5px] rounded-full bg-cyan-200 shadow-[0_0_5px_rgba(165,243,252,0.9)]" />
          <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-[#0d1620]" style={{ background: cor }}>
            <Icone className="h-2.5 w-2.5 text-white" strokeWidth={2.8} />
          </span>
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-semibold">{p.get("t")}</span>
          {p.get("c") && <span className="mt-0.5 block truncate text-[12.5px] text-white/65">{p.get("c")}</span>}
        </span>
        <button type="button" aria-label="Fechar" onClick={(e) => { e.stopPropagation(); void fechar(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/40 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
