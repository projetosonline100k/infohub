import { isDesktop } from "@/lib/platform";

// ⌘Z / ⇧⌘Z no app do Mac: o menu "Editar" (src-tauri/src/lib.rs) manda os
// eventos "menu-desfazer"/"menu-refazer". Em campo de texto ou editor de
// documento, desfaz o texto (como antes); fora disso, avisa a tela aberta
// (ex.: o editor de vídeo) pelos eventos "infopro:desfazer"/"infopro:refazer".
export const EVENTO_DESFAZER = "infopro:desfazer";
export const EVENTO_REFAZER = "infopro:refazer";

function editavel(el: Element | null): boolean {
  if (!el) return false;
  const h = el as HTMLElement;
  return h.isContentEditable || h.tagName === "TEXTAREA" || (h.tagName === "INPUT" && !["checkbox", "radio", "range", "button"].includes((h as HTMLInputElement).type));
}

export async function ligarDesfazerDoMenu() {
  if (!isDesktop()) return;
  const { listen } = await import("@tauri-apps/api/event");
  const tratar = (refazer: boolean) => () => {
    if (editavel(document.activeElement)) document.execCommand(refazer ? "redo" : "undo");
    else window.dispatchEvent(new CustomEvent(refazer ? EVENTO_REFAZER : EVENTO_DESFAZER));
  };
  await listen("menu-desfazer", tratar(false));
  await listen("menu-refazer", tratar(true));
}
