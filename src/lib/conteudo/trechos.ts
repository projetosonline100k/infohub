// Roteiro anotado (pedido do Davi, 17/10/2026, com o desenho do Junior ao lado do Elias):
// "hoje são só blocos, mas eu preciso saber o que foi pensado, o que o Elias ajustou".
// O roteiro vem em trechos, cada um com a nota de quem escreveu (por que fez assim);
// a revisão vem nos mesmos trechos, com a nota do que mudou. Aqui: o que mudou, palavra por palavra.

export interface Trecho { texto: string; nota?: string | null }
export type PedacoDiff = { tipo: "igual" | "saiu" | "entrou"; texto: string };

/** Diferença palavra a palavra (LCS) entre o trecho original e o revisado. */
export function diferencaPalavras(antes: string, depois: string): PedacoDiff[] {
  const a = antes.split(/(\s+)/).filter((x) => x.length);
  const b = depois.split(/(\s+)/).filter((x) => x.length);
  const m = a.length, n = b.length;
  const t: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: PedacoDiff[] = [];
  const add = (tipo: PedacoDiff["tipo"], texto: string) => {
    const ult = out[out.length - 1];
    if (ult && ult.tipo === tipo) ult.texto += texto; else out.push({ tipo, texto });
  };
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { add("igual", a[i]); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) { add("saiu", a[i]); i++; }
    else { add("entrou", b[j]); j++; }
  }
  while (i < m) add("saiu", a[i++]);
  while (j < n) add("entrou", b[j++]);
  return out;
}

/** O trecho mudou na revisão? (ignora espaços). */
export const mudou = (a?: string | null, b?: string | null) => (a ?? "").replace(/\s+/g, " ").trim() !== (b ?? "").replace(/\s+/g, " ").trim();

/** Lista de trechos válida a partir do que veio do banco (textos._trechos[etapa]). */
export function lerTrechos(v: unknown): Trecho[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => (x && typeof x === "object" && typeof (x as Trecho).texto === "string"
    ? [{ texto: (x as Trecho).texto, nota: typeof (x as Trecho).nota === "string" ? (x as Trecho).nota : null }] : []));
}
