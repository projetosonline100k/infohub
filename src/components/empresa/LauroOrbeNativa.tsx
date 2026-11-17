import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { isDesktop } from "@/lib/platform";

// Abre a janela flutuante do Lauro (src/pages/LauroOrbeJanela.tsx) no Mac enquanto ele tem pedido em andamento, em qualquer
// tela do app. A janela se fecha sozinha quando ele termina. Só no app desktop e só para o Davi.
const db = supabase as unknown as SupabaseClient;
const ROTULO = "lauro-orbe";

async function abrirJanela() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  if (await WebviewWindow.getByLabel(ROTULO)) return;
  const { primaryMonitor } = await import("@tauri-apps/api/window");
  const m = await primaryMonitor();
  const larg = m ? m.size.width / m.scaleFactor : 1440;
  const alt = m ? m.size.height / m.scaleFactor : 900;
  const w = 230, h = 190;
  // À esquerda da orbe do Atlas (canto inferior direito), sem cobrir.
  new WebviewWindow(ROTULO, {
    url: "/lauro-orbe", width: w, height: h, x: Math.max(0, larg - w - 190), y: Math.max(0, alt - h - 70),
    decorations: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, shadow: false, focus: false, visibleOnAllWorkspaces: true,
  });
}

export function LauroOrbeNativa() {
  const { user } = useAuth();
  const admin = ehAdmin(user?.email);
  useEffect(() => {
    if (!admin || !isDesktop()) return;
    let vivo = true;
    const checar = async () => {
      try {
        const desde = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data, error } = await db.from("esteira_dark_pedidos").select("id").in("status", ["pendente", "processando"]).gte("criado_em", desde).limit(1);
        if (!vivo || error || !data?.length) return;
        await abrirJanela();
      } catch { /* sem janela nativa */ }
    };
    void checar();
    const t = window.setInterval(() => void checar(), 5000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [admin]);
  return null;
}
