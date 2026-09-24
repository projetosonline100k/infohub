// Estrutura inicial do auto-update (item 8 do pedido). Enquanto
// src-tauri/tauri.conf.json > plugins.updater continuar com pubkey vazia e
// endpoint placeholder ("REPLACE_ME"), check() sempre volta null — nada
// dispara sozinho. Ver docs/DESKTOP.md pro que falta configurar pra valer.
import { isDesktop } from "@/lib/platform";

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isDesktop()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update?.available) return null;
    return { version: update.version, date: update.date, body: update.body };
  } catch {
    // Endpoint/pubkey ainda não configurados, ou sem rede — silencioso de
    // propósito, isso não deve incomodar o usuário nesta etapa.
    return null;
  }
}

export async function installUpdateAndRelaunch(): Promise<void> {
  if (!isDesktop()) return;
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update?.available) return;
  await update.downloadAndInstall();
  await relaunch();
}
