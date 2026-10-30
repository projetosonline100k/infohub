import { isDesktop } from "@/lib/platform";

// ⌘Z / ⇧⌘Z no app do Mac: o menu "Editar" (src-tauri/src/lib.rs) manda os
// eventos "menu-desfazer"/"menu-refazer". Em campo de texto ou editor de
// documento, desfaz o texto (como antes); fora disso, avisa a tela aberta
// (ex.: o editor de vídeo) pelos eventos "infopro:desfazer"/"infopro:refazer".
export const EVENTO_DESFAZER = "infopro:desfazer";
export const EVENTO_REFAZER = "infopro:refazer";
// ⌘W (menu "Janela > Fechar guia", 26/10): a barra de guias fecha a guia aberta.
export const EVENTO_FECHAR_GUIA = "infopro:fechar-guia";
// ⌘T (menu "Janela > Nova guia", 27/10): guia nova perguntando se é para navegar. Vem pelo menu para valer
// também com o navegador de uma guia em foco (ele não passa as teclas para a página).
export const EVENTO_NOVA_GUIA = "infopro:nova-guia";

function editavel(el: Element | null): boolean {
  if (!el) return false;
  const h = el as HTMLElement;
  return h.isContentEditable || h.tagName === "TEXTAREA" || (h.tagName === "INPUT" && !["checkbox", "radio", "range", "button"].includes((h as HTMLInputElement).type));
}

/** Seleciona tudo do campo/editor com o teclado (no editor de documento, o documento inteiro). */
export function selecionarTudo(el: Element | null) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { el.select(); return; }
  const editor = (el?.closest?.(".ProseMirror") as (Element & { editor?: { commands: { selectAll: () => boolean } } }) | null)?.editor;
  if (editor) { editor.commands.selectAll(); return; }
  document.execCommand("selectAll");
}

export async function ligarDesfazerDoMenu() {
  if (!isDesktop()) return;
  const { listen } = await import("@tauri-apps/api/event");
  const tratar = (refazer: boolean) => () => {
    const el = document.activeElement;
    // Editor de texto (documentos, notas, roteiro): ele tem o próprio histórico e não ouve o "undo" do navegador
    // (29/10, Davi: "⌘Z não faz nada"). Recebe o próprio atalho, como se a tecla tivesse chegado nele.
    const editor = el instanceof HTMLElement ? el.closest(".ProseMirror") : null;
    if (editor) {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "z", code: "KeyZ", metaKey: true, shiftKey: refazer, bubbles: true, cancelable: true }));
      return;
    }
    if (editavel(el)) document.execCommand(refazer ? "redo" : "undo");
    else window.dispatchEvent(new CustomEvent(refazer ? EVENTO_REFAZER : EVENTO_DESFAZER));
  };
  await listen("menu-desfazer", tratar(false));
  await listen("menu-refazer", tratar(true));
  await listen("menu-fechar-guia", () => window.dispatchEvent(new CustomEvent(EVENTO_FECHAR_GUIA)));
  await listen("menu-nova-guia", () => window.dispatchEvent(new CustomEvent(EVENTO_NOVA_GUIA)));
  // ⌘A (menu "Editar > Selecionar tudo", 27/10): o evento chega em todas as janelas; age a que está com o
  // teclado. Sem nenhuma, quem está com ele é o site aberto numa guia (a janela principal manda selecionar lá).
  await listen("menu-selecionar-tudo", async () => {
    if (!document.hasFocus()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      if (getCurrentWindow().label === "main") {
        const { invoke } = await import("@tauri-apps/api/core");
        void invoke("navegador_selecionar_tudo").catch(() => undefined);
      }
      return;
    }
    selecionarTudo(document.activeElement);
  });
}
