import { isDesktop } from "@/lib/platform";

// Abre um link externo no navegador padrão. No app desktop (Tauri)
// window.open não faz nada — usa o plugin oficial de abrir links.
export async function abrirLinkExterno(url: string): Promise<void> {
  if (!url) return;
  if (isDesktop()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch (erro) {
      console.error("Não foi possível abrir o link:", erro);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
