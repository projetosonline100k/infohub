import type { LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

const LABEL_UNIDADE: Record<string, string> = { numero: "", minutos: "min", horas: "h", paginas: "páginas" };

export function formatarValor(linha: LinhaHabito): string {
  const { habito, valueNumeric } = linha;
  const unidade = habito.tipo === "numero" ? habito.unidade ?? "" : LABEL_UNIDADE[habito.tipo] ?? "";
  const arred = (n: number) => (habito.tipo === "horas" ? n.toFixed(1) : String(Math.round(n)));
  const atual = arred(valueNumeric ?? 0);
  const meta = habito.meta_diaria != null ? arred(habito.meta_diaria) : null;
  return (meta != null ? `${atual}/${meta} ${unidade}` : `${atual} ${unidade}`).trim();
}
