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

/** Parágrafos de um texto corrido (sem títulos soltos tipo "ROTEIRO"), para quando a etapa não veio em trechos. */
export function paragrafos(texto: string): string[] {
  return texto.split(/\n\s*\n|\n(?=\S)/).map((p) => p.trim())
    .filter((p) => p && !(p.split(/\s+/).length <= 3 && p === p.toUpperCase()));
}

const palavras = (t: string) => new Set(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? []);
const parecido = (a: string, b: string) => {
  const x = palavras(a), y = palavras(b);
  if (!x.size || !y.size) return 0;
  let comum = 0;
  for (const w of x) if (y.has(w)) comum++;
  return comum / Math.min(x.size, y.size);
};

/** Para cada trecho novo, de qual trecho original ele veio (em ordem, pelo texto parecido); null = trecho novo. */
export function alinhar(originais: string[], novos: string[]): (number | null)[] {
  let desde = 0;
  return novos.map((n) => {
    let melhor = -1, nota = 0.45;
    for (let i = desde; i < originais.length; i++) {
      const s = parecido(originais[i], n);
      if (s > nota) { nota = s; melhor = i; }
    }
    if (melhor < 0) return null;
    desde = melhor + 1;
    return melhor;
  });
}

/** Roteiro (quem escreveu) e revisão (quem ajustou) de uma peça da esteira, com a ligação trecho a trecho. */
export function montarPeca(textos: Record<string, unknown>, etapas: { nome: string; membro_id: string }[]) {
  const todos = (textos._trechos as Record<string, unknown> | undefined) ?? {};
  const daEtapa = (i: number) => {
    const e = etapas[i];
    const t = lerTrechos(todos[e.nome]);
    if (t.length) return { etapa: e, i, trechos: t, anotado: true, extras: [] as string[] };
    const c = textos[e.nome];
    if (typeof c !== "string" || !c.trim()) return null;
    // Texto corrido: o que vem depois de "NOTAS…"/"Fontes" são anotações de quem escreveu, não roteiro.
    const ps = paragrafos(c);
    const corte = ps.findIndex((p) => /^(notas?\b|fontes?\b|observa[çc][õo]es\b)/i.test(p));
    const roteiro = corte >= 0 ? ps.slice(0, corte) : ps;
    return { etapa: e, i, trechos: roteiro.map((texto) => ({ texto, nota: null as string | null })), anotado: false, extras: corte >= 0 ? ps.slice(corte) : [] };
  };
  const comTexto = etapas.map((_, i) => (i >= 1 ? daEtapa(i) : null)).filter((x): x is NonNullable<typeof x> => !!x);
  const roteiro = comTexto[0] ?? null;
  const revisao = comTexto.length > 1 ? comTexto[comTexto.length - 1] : null;
  // Os dois em trechos com a mesma contagem: a ligação é pela posição (o revisor devolve os mesmos trechos).
  const origem = roteiro && revisao
    ? (roteiro.anotado && revisao.anotado && roteiro.trechos.length === revisao.trechos.length
      ? revisao.trechos.map((_, k) => k)
      : alinhar(roteiro.trechos.map((t) => t.texto), revisao.trechos.map((t) => t.texto)))
    : [];
  return { roteiro, revisao, origem };
}
