// Sobre tauri-plugin-autostart — registrado no app (src-tauri/src/lib.rs)
// mas desligado por padrão; nenhuma tela chama setAutostart(true) ainda
// (item 7 do pedido: arquitetura pronta, não ativado automaticamente).
import { isDesktop } from "@/lib/platform";

export async function isAutostartEnabled(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isDesktop()) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  if (enabled) await enable();
  else await disable();
}
