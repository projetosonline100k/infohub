// Notificação nativa do Mac (20/10: "em vez de esferas, prefiro uma notificação normal").
// No-op na web. A permissão é pedida uma vez pelo Mac; sem ela, não manda nada.
import { isDesktop } from "@/lib/platform";

let permitido: boolean | null = null;

export async function notificarMac(titulo: string, corpo?: string): Promise<void> {
  if (!isDesktop()) return;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    if (permitido === null) {
      permitido = await n.isPermissionGranted();
      if (!permitido) permitido = (await n.requestPermission()) === "granted";
    }
    if (!permitido) return;
    n.sendNotification({ title: titulo, body: corpo });
  } catch {
    // plugin ausente (app antigo) ou Mac recusou: segue sem notificação
  }
}
