import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronRight, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { capitalizar } from "@/components/assistant/format";
import { cn } from "@/lib/utils";
import { formatarDuracao, OPCOES_WAKE_FEELING, type SleepLog } from "@/lib/sleep/SleepService";

interface SleepOverviewCardProps {
  log: SleepLog | null;
  logsSemana: SleepLog[];
  mediaSemanaMinutos: number | null;
  metaMinutos: number | null;
  onRegistrar: () => void;
  onAbrirSono: () => void;
}

// "SONO — NOITE PASSADA" na Visão geral — um dos 3 cards protagonistas.
// Só dados já calculados por useSleepToday/useSleepHistory (nada novo
// calculado aqui) — inclusive as "últimas 7 noites", que reaproveitam o
// mesmo critério visual (verde = bateu a meta) de SleepWeekChart.tsx.
export function SleepOverviewCard({ log, logsSemana, mediaSemanaMinutos, metaMinutos, onRegistrar, onAbrirSono }: SleepOverviewCardProps) {
  const hojeStr = format(new Date(), "yyyy-MM-dd");
  const maiorMinutos = Math.max(60, ...logsSemana.map((l) => l.total_sleep_minutes));

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <button type="button" onClick={onAbrirSono} className="flex w-full items-center justify-between text-left">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground">
          <Moon className="h-4 w-4 text-status-notes" />
          Sono — noite passada
        </h3>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>

      {log ? (
        <>
          <p className="text-4xl font-bold text-foreground">{formatarDuracao(log.total_sleep_minutes)}</p>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Qualidade</p>
              <p className="font-semibold text-foreground">{log.quality_score}/10</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dormiu</p>
              <p className="font-semibold text-foreground">{log.bed_time.slice(0, 5)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Acordou</p>
              <p className="font-semibold text-foreground">{log.wake_time.slice(0, 5)}</p>
            </div>
            {log.wake_feeling && (
              <div>
                <p className="text-xs text-muted-foreground">Como acordou</p>
                <p className="font-semibold text-foreground">{OPCOES_WAKE_FEELING.find((o) => o.valor === log.wake_feeling)?.label}</p>
              </div>
            )}
          </div>

          {logsSemana.length > 0 && (
            <div className="flex-1 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimas 7 noites</p>
              <div className="flex h-16 items-end gap-1.5">
                {logsSemana.map((l) => (
                  <div key={l.sleep_date} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-full rounded-t-sm",
                        metaMinutos != null && l.total_sleep_minutes >= metaMinutos ? "bg-status-success" : "bg-status-notes"
                      )}
                      style={{ height: `${Math.max(8, (l.total_sleep_minutes / maiorMinutos) * 100)}%` }}
                    />
                    <span className="text-[9px] text-muted-foreground">
                      {l.sleep_date === hojeStr ? "Hoje" : capitalizar(format(parseISO(l.sleep_date), "EEE", { locale: ptBR }))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(mediaSemanaMinutos != null || metaMinutos != null) && (
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
              {mediaSemanaMinutos != null && <span>Média: {formatarDuracao(mediaSemanaMinutos)}</span>}
              {metaMinutos != null && <span>Meta: {formatarDuracao(metaMinutos)}</span>}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
          <p className="text-sm text-muted-foreground">Você ainda não registrou seu sono de hoje.</p>
          <Button type="button" size="sm" onClick={onRegistrar}>
            Registrar sono
          </Button>
        </div>
      )}
    </Card>
  );
}
