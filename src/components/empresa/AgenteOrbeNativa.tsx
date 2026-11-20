import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { isDesktop } from "@/lib/platform";
import { ORBES, trabalhoAtual, type AgenteOrbe } from "./orbeAgentes";

// Abre a janela flutuante de cada agente (src/pages/AgenteOrbeJanela.tsx) no Mac enquanto ele tem trabalho em andamento, em qualquer
// tela do app: o Lauro produzindo um roteiro, o Danilo editando um vídeo (20/11). A janela se fecha sozinha quando ele termina.
// Só no app desktop e só para o Davi.
const db = supabase as unknown as SupabaseClient;

async function abrirJanela(agente: AgenteOrbe) {
  const orbe = ORBES[agente];
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  if (await WebviewWindow.getByLabel(orbe.rotulo)) return;
  const { primaryMonitor } = await import("@tauri-apps/api/window");
  const m = await primaryMonitor();
  const larg = m ? m.size.width / m.scaleFactor : 1440;
  const alt = m ? m.size.height / m.scaleFactor : 900;
  const w = 230, h = 190;
  // À esquerda da orbe do Atlas (canto inferior direito), sem cobrir; o Danilo fica logo acima do Lauro.
  new WebviewWindow(orbe.rotulo, {
    url: orbe.rota, width: w, height: h, x: Math.max(0, larg - w - 190), y: Math.max(0, alt - h - 70 - orbe.acima),
    decorations: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, shadow: false, focus: false, visibleOnAllWorkspaces: true,
  });
}

export function AgenteOrbeNativa() {
  const { user } = useAuth();
  const admin = ehAdmin(user?.email);
  useEffect(() => {
    if (!admin || !isDesktop()) return;
    let vivo = true;
    const checar = async () => {
      for (const agente of Object.keys(ORBES) as AgenteOrbe[]) {
        try {
          const t = await trabalhoAtual(agente, db);
          if (vivo && t) await abrirJanela(agente);
        } catch { /* sem janela nativa */ }
      }
    };
    void checar();
    const t = window.setInterval(() => void checar(), 5000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [admin]);
  return null;
}
