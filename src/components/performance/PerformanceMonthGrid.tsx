import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatarValor } from "./format";
import type { Habito } from "@/lib/performance/PerformanceHabitService";
import type { LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

interface PerformanceMonthGridProps {
  habitos: Habito[];
  dias: string[];
  linhasPorHabito: Map<string, LinhaHabito[]>;
}

// Grid mensal (item 11): ● concluído / ○ não realizado / – não programado.
// Clicar num DIA (cabeçalho da coluna) mostra o valor de cada hábito
// naquele dia, exatamente como no exemplo do pedido.
export function PerformanceMonthGrid({ habitos, dias, linhasPorHabito }: PerformanceMonthGridProps) {
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  const linhasDoDia = diaSelecionado
    ? habitos
        .map((h) => linhasPorHabito.get(h.id)?.find((l) => l.date === diaSelecionado))
        .filter((l): l is LinhaHabito => !!l)
    : [];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[110px] bg-card px-2 py-1.5 text-left" />
              {dias.map((d) => (
                <th key={d} className="px-0.5 py-1">
                  <button
                    type="button"
                    onClick={() => setDiaSelecionado(d)}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted",
                      diaSelecionado === d && "bg-primary/10 text-primary"
                    )}
                  >
                    {format(parseISO(d), "d")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habitos.map((h) => {
              const linhas = linhasPorHabito.get(h.id) ?? [];
              return (
                <tr key={h.id} className="border-t border-border/60">
                  <td className="sticky left-0 z-10 max-w-[110px] truncate bg-card px-2 py-1.5 font-medium text-foreground">{h.nome}</td>
                  {linhas.map((l) => (
                    <td key={l.date} className="px-0.5 py-1.5 text-center">
                      <span className={cn(!l.programado ? "text-muted-foreground/30" : l.completed ? "text-status-success" : "text-muted-foreground")}>
                        {!l.programado ? "–" : l.completed ? "●" : "○"}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {diaSelecionado && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium text-foreground">{format(parseISO(diaSelecionado), "d 'de' MMMM", { locale: ptBR })}</p>
          <div className="mt-1.5 space-y-1">
            {linhasDoDia.map((l) => (
              <p key={l.habito.id} className="text-xs text-muted-foreground">
                {l.habito.nome}:{" "}
                {!l.programado
                  ? "não programado"
                  : l.habito.tipo === "boolean"
                  ? l.completed ? "✓" : "○"
                  : formatarValor(l)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
