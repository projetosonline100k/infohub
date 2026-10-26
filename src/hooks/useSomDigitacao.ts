import { useEffect } from "react";
import { EVENTO_SOM_DIGITACAO, somLigado, tocarTecla } from "@/lib/somDigitacao";

// Toca o som de máquina de escrever ao digitar em qualquer campo de texto do app (documentos, roteiros, notas,
// chats, buscas…). Atalhos (⌘/Ctrl), setas e teclas segurando (repetição) não fazem barulho.
const TIPOS_DE_TEXTO = new Set(["text", "search", "email", "url", "tel", "password", "number", ""]);
function campoDeEscrever(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.isContentEditable || el.closest?.(".ProseMirror")) return true;
  if (el.tagName === "TEXTAREA") return !(el as HTMLTextAreaElement).readOnly;
  if (el.tagName === "INPUT") { const i = el as HTMLInputElement; return !i.readOnly && TIPOS_DE_TEXTO.has(i.type); }
  return false;
}

export function useSomDigitacao() {
  useEffect(() => {
    let ligado = somLigado();
    const mudou = (e: Event) => { ligado = (e as CustomEvent<boolean>).detail; };
    const tecla = (e: KeyboardEvent) => {
      if (!ligado || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return;
      // 26/10 (Davi: "o som do teclado em tudo dentro do sistema, não só no docs"): qualquer lugar de escrever —
      // editores, campos de texto, chats, buscas. Fora de campo (atalhos de página) continua mudo.
      if (!campoDeEscrever(e.target as HTMLElement | null)) return;
      if (e.key === "Enter") tocarTecla("enter");
      else if (e.key === " ") tocarTecla("espaco");
      else if (e.key === "Backspace" || e.key === "Delete") tocarTecla("apagar");
      else if (e.key.length === 1) tocarTecla("letra");
    };
    window.addEventListener(EVENTO_SOM_DIGITACAO, mudou);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener(EVENTO_SOM_DIGITACAO, mudou); window.removeEventListener("keydown", tecla, true); };
  }, []);
}
