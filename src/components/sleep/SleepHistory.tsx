import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSleepHistory } from "@/hooks/useSleepHistory";
import { formatarHorario } from "@/lib/sleep/SleepMetricsService";
import { formatarDuracao, OPCOES_WAKE_FEELING } from "@/lib/sleep/SleepService";
import type { FiltroHistorico, PeriodoPersonalizado } from "@/hooks/usePerformanceHistory";

interface SleepHistoryProps {
  filtro: FiltroHistorico;
  personalizado?: PeriodoPersonalizado;
}

// Bloco de sono dentro da aba Histórico de Performance (item 8) — mesmo
// filtro (7 dias/30 dias/este mês/mês anterior) já usado pros hábitos.
// Clicar num dia mostra o registro detalhado daquela noite.
export function SleepHistory({ filtro, personalizado }: SleepHistoryProps) {
  const { logs, metricas, loading } = useSleepHistory(filtro, personalizado);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const logSelecionado = logs.find((l) => l.sleep_date === selecionado) ?? null;

  if (loading) return null;

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Sono</h3>

      {metricas.totalNoites === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma noite registrada nesse período.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div>
              <p className="uppercase tracking-wide text-muted-foreground">Média</p>
              <p className="text-sm font-semibold text-foreground">{formatarDuracao(metricas.mediaMinutos)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-muted-foreground">Qualidade média</p>
              <p className="text-sm font-semibold text-foreground">{metricas.mediaQualidade}/10</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-muted-foreground">Noites registradas</p>
              <p className="text-sm font-semibold text-foreground">{metricas.totalNoites}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-muted-foreground">Dentro da meta</p>
              <p className="text-sm font-semibold text-foreground">{metricas.noitesDentroDaMeta}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-muted-foreground">Dormir médio</p>
              <p className="text-sm font-semibold text-foreground">
                {metricas.horarioMedioDormirMinutos != null ? formatarHorario(metricas.horarioMedioDormirMinutos) : "—"}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-muted-foreground">Acordar médio</p>
              <p className="text-sm font-semibold text-foreground">
                {metricas.horarioMedioAcordarMinutos != null ? formatarHorario(metricas.horarioMedioAcordarMinutos) : "—"}
              </p>
            </div>
          </div>

          <div className="max-h-40 space-y-0.5 overflow-y-auto border-t border-border/60 pt-2">
            {[...logs].reverse().map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelecionado((atual) => (atual === l.sleep_date ? null : l.sleep_date))}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors",
                  selecionado === l.sleep_date ? "bg-muted" : "hover:bg-muted/60"
                )}
              >
                <span className="text-foreground">{format(parseISO(l.sleep_date), "d 'de' MMM", { locale: ptBR })}</span>
                <span className="text-muted-foreground">
                  {formatarDuracao(l.total_sleep_minutes)} · {l.quality_score}/10
                </span>
              </button>
            ))}
          </div>

          {logSelecionado && (
            <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              <p>
                Dormiu {logSelecionado.bed_time.slice(0, 5)} · Acordou {logSelecionado.wake_time.slice(0, 5)}
                {logSelecionado.wake_feeling && <> · {OPCOES_WAKE_FEELING.find((o) => o.valor === logSelecionado.wake_feeling)?.label}</>}
              </p>
              {logSelecionado.notes && <p className="mt-1 italic">"{logSelecionado.notes}"</p>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
