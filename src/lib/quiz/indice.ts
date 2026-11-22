// Índice de Leitor do quiz V3 (22/11/2026, Davi: "mais rápido, foco no mensal"). Sem imports: testável.
// Nota = base + soma das `nota` das opções escolhidas, arredondada e limitada entre 0 e `teto` (nunca 10: sempre sobra "faltam X pontos").
// O perfil vem da primeira faixa com nota <= `ate` (no lugar dos pontos por perfil).
export interface ConfigIndice {
  max?: number; base?: number; teto?: number;
  titulo?: string; recap?: string; falta?: string;
  faixas: { ate: number; perfil: string }[];
  beneficios_titulo?: string; beneficios_de?: string[];
}
interface PerguntaIndice { id: string; opcoes: { nota?: number; beneficio?: { titulo?: string; texto?: string } }[] }

export function calcularNotaIndice(i: ConfigIndice, perguntas: PerguntaIndice[], escolhas: Record<string, number>): number {
  const max = i.max ?? 10;
  const teto = Math.min(i.teto ?? max - 1, max);
  let nota = i.base ?? 0;
  for (const q of perguntas) {
    const n = q.opcoes[escolhas[q.id]]?.nota;
    if (typeof n === "number" && Number.isFinite(n)) nota += n;
  }
  return Math.max(0, Math.min(teto, Math.round(nota)));
}

/** Id do perfil da nota: a primeira faixa com nota <= ate (a última vale como "o resto"). */
export function perfilDoIndice(i: ConfigIndice, nota: number): string | null {
  const f = i.faixas.find((x) => nota <= x.ate) ?? i.faixas[i.faixas.length - 1];
  return f?.perfil ?? null;
}

/** Cartões de benefício das respostas das perguntas de `beneficios_de` (ordem dada, sem repetir). */
export function beneficiosDoIndice(i: ConfigIndice, perguntas: PerguntaIndice[], escolhas: Record<string, number>): { titulo: string; texto: string }[] {
  const lista: { titulo: string; texto: string }[] = [];
  for (const id of i.beneficios_de ?? []) {
    const b = perguntas.find((q) => q.id === id)?.opcoes[escolhas[id]]?.beneficio;
    if (b && (b.titulo || b.texto) && !lista.some((x) => x.titulo === (b.titulo ?? "") && x.texto === (b.texto ?? ""))) lista.push({ titulo: b.titulo ?? "", texto: b.texto ?? "" });
  }
  return lista;
}
