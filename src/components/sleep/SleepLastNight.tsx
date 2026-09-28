import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarDuracao, OPCOES_WAKE_FEELING, type SleepLog } from "@/lib/sleep/SleepService";

interface SleepLastNightProps {
  log: SleepLog | null;
  // daily_productivity_reports.planned_bed_time de ontem (item 11) — só
  // preenchido a partir do Bloco 6 (Encerrar o dia); até lá fica null e o
  // bloco de comparação simplesmente não aparece.
  plannedBedTime?: string | null;
  onRegistrar: () => void;
  onEditar: () => void;
}

function diferencaMinutos(planejadoHHmm: string, realHHmm: string): number {
  const [ph, pm] = planejadoHHmm.split(":").map(Number);
  const [rh, rm] = realHHmm.split(":").map(Number);
  let diff = rh * 60 + rm - (ph * 60 + pm);
  if (diff > 12 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}

// Detalhe completo da última noite — topo da aba Sono.
export function SleepLastNight({ log, plannedBedTime, onRegistrar, onEditar }: SleepLastNightProps) {
  if (!log) {
    return (
      <Card className="space-y-3 p-5 text-center">
        <p className="text-4xl" aria-hidden="true">🌙</p>
        <p className="text-sm text-muted-foreground">Você ainda não registrou seu sono de hoje.</p>
        <Button type="button" onClick={onRegistrar}>Registrar sono</Button>
      </Card>
    );
  }

  const diff = plannedBedTime ? diferencaMinutos(plannedBedTime.slice(0, 5), log.bed_time.slice(0, 5)) : null;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Última noite</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEditar}>Editar</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Sono</p>
          <p className="text-xl font-bold text-foreground">{formatarDuracao(log.total_sleep_minutes)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Dormiu</p>
          <p className="text-xl font-bold text-foreground">{log.bed_time.slice(0, 5)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Acordou</p>
          <p className="text-xl font-bold text-foreground">{log.wake_time.slice(0, 5)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Qualidade</p>
          <p className="text-xl font-bold text-foreground">{log.quality_score}/10</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {log.wake_feeling && (
          <span>
            Como acordou: <span className="text-foreground">{OPCOES_WAKE_FEELING.find((o) => o.valor === log.wake_feeling)?.label}</span>
          </span>
        )}
        {log.night_awakenings != null && (
          <span>
            Despertares: <span className="text-foreground">{log.night_awakenings}</span>
          </span>
        )}
      </div>

      {log.notes && <p className="text-sm italic text-muted-foreground">"{log.notes}"</p>}

      {diff != null && (
        <p className="text-xs text-muted-foreground">
          Planejou dormir {plannedBedTime?.slice(0, 5)} · Dormiu {log.bed_time.slice(0, 5)} ·{" "}
          <span className={cn(diff > 15 ? "text-status-warning" : "text-status-success")}>
            {diff > 0 ? `+${diff}min` : diff < 0 ? `${diff}min` : "no horário"}
          </span>
        </p>
      )}
    </Card>
  );
}
