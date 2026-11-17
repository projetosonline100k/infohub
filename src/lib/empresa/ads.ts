// Contas dos números do Facebook Ads (dash do Kdu; 17/11/2026). Lógica pura, testada em tests/empresaAds.test.mjs.
export interface MetricaDia { campanha_ref: string; dia: string; gasto: number; impressoes: number; cliques: number; resultados: number; valor_conversao: number }
export interface Totais { gasto: number; impressoes: number; cliques: number; resultados: number; valor: number }
export const zero = (): Totais => ({ gasto: 0, impressoes: 0, cliques: 0, resultados: 0, valor: 0 });

const dividir = (a: number, b: number) => (b > 0 ? a / b : null);
export const custoPorResultado = (t: Totais) => dividir(t.gasto, t.resultados);
export const retorno = (t: Totais) => (t.valor > 0 ? dividir(t.valor, t.gasto) : null);   // ROAS; sem receita medida = não mostra
export const ctr = (t: Totais) => { const v = dividir(t.cliques, t.impressoes); return v === null ? null : v * 100; };
export const cpm = (t: Totais) => { const v = dividir(t.gasto, t.impressoes); return v === null ? null : v * 1000; };

/** `dias` = 1 (hoje), 7, 14, 30…: o dia de hoje e os anteriores. `hoje` = AAAA-MM-DD (Brasília). */
export function desdeDia(hoje: string, dias: number): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return d.toISOString().slice(0, 10);
}
const soma = (t: Totais, m: MetricaDia) => { t.gasto += +m.gasto || 0; t.impressoes += +m.impressoes || 0; t.cliques += +m.cliques || 0; t.resultados += +m.resultados || 0; t.valor += +m.valor_conversao || 0; return t; };

export function filtrar(metricas: MetricaDia[], de: string, ate?: string) {
  return metricas.filter((m) => m.dia >= de && (!ate || m.dia <= ate));
}
export function totais(metricas: MetricaDia[]): Totais { return metricas.reduce(soma, zero()); }

export function porCampanha(metricas: MetricaDia[]): Map<string, Totais> {
  const mapa = new Map<string, Totais>();
  for (const m of metricas) mapa.set(m.campanha_ref, soma(mapa.get(m.campanha_ref) ?? zero(), m));
  return mapa;
}
/** Uma entrada por dia do período (dias sem dado = zero), do mais antigo ao mais novo. */
export function serieDiaria(metricas: MetricaDia[], de: string, ate: string): { dia: string; gasto: number; resultados: number }[] {
  const por = new Map<string, Totais>();
  for (const m of metricas) por.set(m.dia, soma(por.get(m.dia) ?? zero(), m));
  const saida: { dia: string; gasto: number; resultados: number }[] = [];
  for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    const t = por.get(dia);
    saida.push({ dia, gasto: t ? Math.round(t.gasto * 100) / 100 : 0, resultados: t?.resultados ?? 0 });
  }
  return saida;
}
/** Campanha que gastou e não trouxe resultado no período (limite de gasto em reais para não alarmar com centavos). */
export const semResultado = (t: Totais, limite = 20) => t.gasto >= limite && t.resultados === 0;

/** Variação do período contra o anterior de mesmo tamanho, em %, ou null se o anterior era zero. */
export function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
}
