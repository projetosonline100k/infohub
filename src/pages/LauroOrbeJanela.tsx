import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { startWindowDrag, openMainWindow } from "@/lib/desktop/window";
import { cn } from "@/lib/utils";

// Janela nativa do Lauro (17/11/2026, Davi: "quando ele estiver fazendo algo, preciso que ele fique flutuando no meu pc, e
// algo em volta dele sinalizando"): transparente, sempre por cima de tudo. Criada por LauroOrbeNativa enquanto há pedido do
// Lauro em andamento; se fecha sozinha quando ele termina. Mostra o anel girando em volta da bolinha e o que ele está fazendo.
document.documentElement.classList.add("jarvis-window");
const db = supabase as unknown as SupabaseClient;
interface Pedido { id: string; mensagem: string; status: string; criado_em: string }

function resumoDoPedido(mensagem: string): string {
  if (/^(NOVO ROTEIRO|AJUSTE no roteiro)/.test(mensagem)) return "Produzindo um roteiro";
  const t = mensagem.replace(/\s+/g, " ").trim();
  return t.length > 70 ? `${t.slice(0, 70)}…` : t;
}

export default function LauroOrbeJanela() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [parado, setParado] = useState(false);
  const vazios = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add("jarvis-window");
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke<boolean>("lauro_controle_estado")).then(setParado).catch(() => undefined);
  }, []);

  const checar = useCallback(async () => {
    const desde = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data, error } = await db.from("esteira_dark_pedidos").select("id, mensagem, status, criado_em").in("status", ["pendente", "processando"]).gte("criado_em", desde).order("criado_em", { ascending: false }).limit(1);
    if (error) return;   // sem sessão/sem rede: não fecha por causa disso
    const p = ((data ?? []) as Pedido[])[0] ?? null;
    setPedido(p);
    vazios.current = p ? 0 : vazios.current + 1;
    if (vazios.current >= 3) {   // ~9 s sem nada: terminou, a janela some
      try { const { getCurrentWindow } = await import("@tauri-apps/api/window"); await getCurrentWindow().destroy(); } catch { /* fora do app */ }
    }
  }, []);
  useEffect(() => {
    void checar();
    const t = window.setInterval(() => void checar(), 3000);
    return () => window.clearInterval(t);
  }, [checar]);

  const alternarControle = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      setParado(await invoke<boolean>("lauro_controle_parar", { ativo: !parado }));
    } catch { /* fora do app */ }
  };

  return (
    <div className="flex h-screen w-screen select-none flex-col items-center justify-center gap-2 overflow-hidden" onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button")) return; void startWindowDrag(); }}>
      <div className="relative grid h-[84px] w-[84px] place-items-center">
        <span className="absolute inset-0 rounded-full bg-cyan-400/30" style={{ animation: "lauro-onda 2s ease-out infinite" }} />
        <span className="absolute inset-0 rounded-full bg-cyan-400/30" style={{ animation: "lauro-onda 2s ease-out 1s infinite" }} />
        <span className="absolute -inset-1.5 rounded-full border-[3px] border-transparent border-t-cyan-300 border-r-cyan-300/60 shadow-[0_0_22px_rgba(103,232,249,0.65)]" style={{ animation: "lauro-gira 1.1s linear infinite" }} />
        <span className="relative grid h-[68px] w-[68px] place-items-center rounded-full border-2 border-cyan-300/80 bg-[#0c1b27] shadow-[0_0_28px_rgba(34,211,238,0.5)]">
          <span className="flex gap-2"><span className="h-3 w-3 rounded-full bg-cyan-300" style={{ animation: "lauro-pisca 3s ease-in-out infinite" }} /><span className="h-3 w-3 rounded-full bg-cyan-300" style={{ animation: "lauro-pisca 3s ease-in-out infinite" }} /></span>
        </span>
      </div>
      <div className="flex max-w-[210px] flex-col items-center gap-1 rounded-2xl border border-cyan-300/30 bg-[#0c1b27]/95 px-3 py-1.5 text-center shadow-xl">
        <p className="text-[11px] font-semibold text-cyan-200">Lauro trabalhando…</p>
        {pedido && <p className="line-clamp-2 text-[10px] leading-tight text-white/60">{resumoDoPedido(pedido.mensagem)}</p>}
        <div className="mt-0.5 flex gap-1">
          <button type="button" onClick={() => void openMainWindow()} className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-white/80 hover:bg-white/20">Abrir</button>
          <button type="button" onClick={() => void alternarControle()} className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold", parado ? "border-amber-400/60 bg-amber-500/20 text-amber-200" : "border-rose-400/50 text-rose-300 hover:bg-rose-500/10")}>{parado ? "Liberar controle" : "Parar controle"}</button>
        </div>
      </div>
    </div>
  );
}
