// Pergunta "marque N" do quiz (estilo "lado", 13/11/2026, Davi: "o Insta do lado, a pessoa seleciona os itens, a barra embaixo enche até completar o 5; pode ser só 3"). Sem imports: testável.

/** Quantos itens a pessoa precisa marcar (3 ou 5; padrão 5), nunca mais que as opções que existem. */
export const metaDaSelecao = (q: { meta?: number; opcoes: unknown[] }) =>
  Math.max(1, Math.min(q.opcoes.length, Number.isFinite(q.meta) && (q.meta as number) > 0 ? Math.round(q.meta as number) : 5));

/** Marca/desmarca `k` respeitando o limite: devolve a nova lista, ou null se já atingiu o limite (nada muda). */
export function alternarMarcada(atual: number[], k: number, limite?: number): number[] | null {
  if (atual.includes(k)) return atual.filter((x) => x !== k);
  if (limite !== undefined && atual.length >= limite) return null;
  return [...atual, k];
}
