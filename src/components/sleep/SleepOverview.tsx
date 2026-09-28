import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import { useSleepToday } from "@/hooks/useSleepToday";
import { useSleepHistory } from "@/hooks/useSleepHistory";
import { formatarHorario, gerarInsightsSono } from "@/lib/sleep/SleepMetricsService";
import { formatarDuracao } from "@/lib/sleep/SleepService";
import { buscarHistorico, buscarRelatorioDoDia, type RelatorioDiario } from "@/lib/productivity/DailyReportService";
import { SleepLastNight } from "./SleepLastNight";
import { SleepRegisterForm } from "./SleepRegisterForm";
import { SleepGoalForm } from "./SleepGoalForm";
import { SleepWeekChart } from "./SleepWeekChart";

// "MÉTRICAS DE 7 DIAS" (item 6) — pequeno bloco de números, sem gráfico.
function Metricas7Dias() {
  const { metricas, metaMinutos, loading } = useSleepHistory("7dias");
  if (loading || metricas.totalNoites === 0) return null;

  return (
    <Card className="grid grid-cols-2 gap-3 p-5 text-sm sm:grid-cols-4">
      <div>
        <p className="text-xs text-muted-foreground">Média do sono</p>
        <p className="font-semibold text-foreground">{formatarDuracao(metricas.mediaMinutos)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Meta</p>
        <p className="font-semibold text-foreground">{formatarDuracao(metaMinutos)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Noites dentro da meta</p>
        <p className="font-semibold text-foreground">{metricas.noitesDentroDaMeta}/{metricas.totalNoites}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Qualidade média</p>
        <p className="font-semibold text-foreground">{metricas.mediaQualidade}/10</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Maior duração</p>
        <p className="font-semibold text-foreground">{formatarDuracao(metricas.maiorMinutos)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Menor duração</p>
        <p className="font-semibold text-foreground">{formatarDuracao(metricas.menorMinutos)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Horário médio de dormir</p>
        <p className="font-semibold text-foreground">{metricas.horarioMedioDormirMinutos != null ? formatarHorario(metricas.horarioMedioDormirMinutos) : "—"}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Horário médio de acordar</p>
        <p className="font-semibold text-foreground">{metricas.horarioMedioAcordarMinutos != null ? formatarHorario(metricas.horarioMedioAcordarMinutos) : "—"}</p>
      </div>
    </Card>
  );
}

// Padrões de sono (item 13) — descrições estatísticas simples, nunca
// causais, e só aparecem com amostra suficiente (ver gerarInsightsSono).
function InsightsSono() {
  const { user } = useAuth();
  const { logs } = useSleepHistory("30dias");
  const [relatorios, setRelatorios] = useState<RelatorioDiario[]>([]);

  useEffect(() => {
    if (!user) return;
    buscarHistorico(user.id, "30dias")
      .then(setRelatorios)
      .catch(() => setRelatorios([]));
  }, [user]);

  const insights = useMemo(() => gerarInsightsSono(logs, relatorios), [logs, relatorios]);
  if (insights.length === 0) return null;

  return (
    <Card className="space-y-2 p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground">
        <Lightbulb className="h-4 w-4" />
        Padrões de sono
      </h3>
      <ul className="space-y-1.5">
        {insights.map((texto) => (
          <li key={texto} className="text-sm text-muted-foreground">{texto}</li>
        ))}
      </ul>
    </Card>
  );
}

// Aba "Sono" — orquestrador.
export function SleepOverview() {
  const { user } = useAuth();
  const { log, meta, loading, dataStr, registrar, salvarMeta } = useSleepToday();
  const { logs: ultimos7 } = useSleepHistory("7dias");
  const [dialogAberto, setDialogAberto] = useState(false);
  // "Planejou dormir X · Dormiu Y" (item 11) — o que foi respondido ONTEM
  // no Encerrar o dia, comparado contra o registro de sono de HOJE.
  const [plannedBedTimeOntem, setPlannedBedTimeOntem] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const ontemStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    buscarRelatorioDoDia(user.id, ontemStr)
      .then((r) => setPlannedBedTimeOntem(r?.planned_bed_time ?? null))
      .catch(() => setPlannedBedTimeOntem(null));
  }, [user]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Carregando sono...</p>;
  }

  return (
    <div className="space-y-4">
      <SleepLastNight log={log} plannedBedTime={plannedBedTimeOntem} onRegistrar={() => setDialogAberto(true)} onEditar={() => setDialogAberto(true)} />
      <SleepWeekChart logs={ultimos7} metaMinutos={meta?.target_sleep_minutes ?? 450} hojeStr={dataStr} />
      <Metricas7Dias />
      <InsightsSono />
      <SleepGoalForm meta={meta} onSalvar={salvarMeta} />

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{log ? "Editar sono" : "Registrar sono"}</DialogTitle>
          </DialogHeader>
          <SleepRegisterForm logExistente={log} onSalvar={registrar} onSalvo={() => setDialogAberto(false)} onCancelar={() => setDialogAberto(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
