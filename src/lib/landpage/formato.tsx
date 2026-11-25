import type { ReactNode } from "react";

// Formatação dentro do texto da land page (25/11/2026, Davi: "grifar as palavras ou diminuir alguma palavra"):
// **negrito**, ==grifado== e ^^menor^^. Os botões do editor só colocam essas marcas em volta da seleção.
export const MARCAS = { negrito: "**", grifo: "==", menor: "^^" } as const;
export type Marca = keyof typeof MARCAS;

const PADRAO = /(\*\*[^*]+\*\*|==[^=]+==|\^\^[^^]+\^\^)/g;

/** Texto com marcas → pedaços de React. `grifo` é a cor do marca-texto. Marca sem fechar fica como texto comum. */
export function formatar(texto: string | undefined, grifo = "#fde047"): ReactNode[] {
  return (texto ?? "").split(PADRAO).map((p, i) => {
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.length > 4 && p.startsWith("==") && p.endsWith("==")) return <mark key={i} className="rounded px-1" style={{ background: grifo, color: "#111" }}>{p.slice(2, -2)}</mark>;
    if (p.length > 4 && p.startsWith("^^") && p.endsWith("^^")) return <small key={i} className="text-[0.7em] font-normal opacity-80">{p.slice(2, -2)}</small>;
    return p;
  });
}

/** Põe (ou tira, se já estiver) a marca em volta de `ini..fim` do texto. Sem seleção, não muda nada. */
export function aplicarMarca(texto: string, ini: number, fim: number, m: Marca): { texto: string; ini: number; fim: number } {
  const k = MARCAS[m];
  if (fim <= ini) return { texto, ini, fim };
  const sel = texto.slice(ini, fim);
  if (sel.startsWith(k) && sel.endsWith(k) && sel.length > 2 * k.length) { const x = sel.slice(k.length, -k.length); return { texto: texto.slice(0, ini) + x + texto.slice(fim), ini, fim: ini + x.length }; }
  if (texto.slice(ini - k.length, ini) === k && texto.slice(fim, fim + k.length) === k) return { texto: texto.slice(0, ini - k.length) + sel + texto.slice(fim + k.length), ini: ini - k.length, fim: fim - k.length };
  return { texto: texto.slice(0, ini) + k + sel + k + texto.slice(fim), ini: ini + k.length, fim: fim + k.length };
}
