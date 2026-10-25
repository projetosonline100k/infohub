import { useEffect } from "react";
import { EVENTO_SOM_DIGITACAO, somLigado, tocarTecla } from "@/lib/somDigitacao";

// Toca o som de máquina de escrever ao digitar dentro de um editor de documento (TipTap/ProseMirror): documentos,
// roteiros, notas. Atalhos (⌘/Ctrl), setas e teclas segurando (repetição) não fazem barulho.
export function useSomDigitacao() {
  useEffect(() => {
    let ligado = somLigado();
    const mudou = (e: Event) => { ligado = (e as CustomEvent<boolean>).detail; };
    const tecla = (e: KeyboardEvent) => {
      if (!ligado || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return;
      const alvo = e.target as HTMLElement | null;
      if (!alvo?.closest?.(".ProseMirror")) return;
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
