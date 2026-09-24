// Wrappers finos sobre os comandos Tauri do FocusActivityMonitor (Rust, ver
// src-tauri/src/focus_monitor.rs) — únicos pontos do app que chamam esses
// comandos. No-op na web (isDesktop()-guardado). Rust só descobre app/
// janela ativa e manda o tick cru; toda classificação/gravação no Supabase
// acontece em src/hooks/useFocusActivityMonitor.ts.
import { isDesktop } from "@/lib/platform";

export interface FocusTick {
  appName: string | null;
  bundleId: string | null;
  windowTitle: string | null;
  timestampMs: number;
}

export async function startFocusMonitor(analisarTitulo: boolean): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("start_focus_monitor", { analisarTitulo });
  } catch {
    /* ignora — sem o monitor nativo, só não há detecção de app ativo */
  }
}

export async function stopFocusMonitor(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_focus_monitor");
  } catch {
    /* ignora */
  }
}

// true = permissão de Accessibility já concedida (necessária só pra
// título da janela — nome do app nunca precisa dela). Nunca solicita nem
// contorna, só lê o estado atual.
export async function checkAccessibilityTrusted(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("check_accessibility_trusted");
  } catch {
    return false;
  }
}

export async function openAccessibilitySettings(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_accessibility_settings");
  } catch {
    /* ignora */
  }
}

export async function onFocusTick(handler: (tick: FocusTick) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<FocusTick>("focus-tick", (event) => handler(event.payload));
    return unlisten;
  } catch {
    return () => {};
  }
}
