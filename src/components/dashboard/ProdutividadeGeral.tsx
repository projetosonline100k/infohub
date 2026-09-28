import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CheckCircle2, Flame, Gauge, Lightbulb, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatTile } from "./StatTile";
import { useProductivityDashboard } from "@/hooks/useProductivityDashboard";
import { useDailyPlan } from "@/hooks/useDailyPlan";
import { formatarTempo } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// Seção "Produtividade" do Dashboard (itens 9-10) — mesmo padrão de
// FaturamentoGeral.tsx (StatTile + LineChart hand-rolled, sem RPC/React
// Query, igual ao resto do Dashboard). Hoje usa o relatório do dia se já
// existir, senão métricas ao vivo calculadas na hora (nunca um "0"
// fabricado pra distração/apps quando o monitoramento nunca foi ligado).
export function ProdutividadeGeral() {
  const navigate = useNavigate();
  const { loading, relatorioHoje, metricasHojeAoVivo, mediasUltimos7Dias, insights } = useProductivityDashboard();
  const dailyPlan = useDailyPlan();

  if (loading) {
    return (
      <Card className="p-5 shadow-sm">
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando produtividade...</p>
      </Card>
    );
  }

  const focoHojeSegundos = relatorioHoje?.focused_seconds ?? metricasHojeAoVivo?.focusedSeconds ?? 0;
  const tarefasHoje = relatorioHoje?.completed_tasks ?? metricasHojeAoVivo?.completedTasks ?? 0;
  const distracaoHojeSegundos = relatorioHoje?.distraction_seconds ?? (metricasHojeAoVivo?.monitoramentoAtivo ? metricasHojeAoVivo.distractionSeconds : null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={Gauge}
          label="Produtividade hoje"
          value={relatorioHoje ? `${relatorioHoje.productivity_score}/10` : "—"}
          tone={relatorioHoje ? "good" : "neutral"}
          hint={relatorioHoje ? undefined : "Encerre o dia pra registrar uma nota"}
        />
        <StatTile icon={Flame} label="Foco hoje" value={formatarTempo(Math.round(focoHojeSegundos / 60))} tone="good" />
        <StatTile icon={CheckCircle2} label="Tarefas concluídas hoje" value={String(tarefasHoje)} tone="good" />
      </div>

      {dailyPlan.plano && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            icon={Target}
            label="80/20 concluído hoje"
            value={`${dailyPlan.concluidasCount} de ${dailyPlan.totalCount}`}
            tone={dailyPlan.concluidasCount === dailyPlan.totalCount && dailyPlan.totalCount > 0 ? "good" : "neutral"}
          />
          <StatTile
            icon={Flame}
            label="Prioridade #1 concluída"
            value={dailyPlan.prioridadeUm ? (dailyPlan.prioridadeUm.concluida ? "Sim" : "Ainda não") : "—"}
            tone={dailyPlan.prioridadeUm?.concluida ? "good" : "neutral"}
          />
        </div>
      )}

      <Card className="p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Últimos 7 dias</h3>
          <Button variant="outline" size="sm" className="h-8" onClick={() => navigate("/produtividade")}>
            Ver relatórios
          </Button>
        </div>

        {!mediasUltimos7Dias ? (
          <p className="py-4 text-sm text-muted-foreground">Nenhum relatório de "Encerrar o dia" ainda nos últimos 7 dias.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 pb-4 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Média produtividade</p>
                <p className="text-2xl font-bold text-foreground">{mediasUltimos7Dias.mediaProdutividade.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Horas focadas</p>
                <p className="text-2xl font-bold text-foreground">{mediasUltimos7Dias.horasTotaisFocadas.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tarefas concluídas</p>
                <p className="text-2xl font-bold text-foreground">{mediasUltimos7Dias.tarefasConcluidas}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Prioridade concluída</p>
                <p className="text-2xl font-bold text-foreground">{mediasUltimos7Dias.percentualPrioridadeConcluida.toFixed(0)}%</p>
              </div>
              {mediasUltimos7Dias.aderenciaPlanoPercentual != null && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Aderência ao plano</p>
                  <p className="text-2xl font-bold text-foreground">{mediasUltimos7Dias.aderenciaPlanoPercentual.toFixed(0)}%</p>
                </div>
              )}
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mediasUltimos7Dias.porDia.map((d) => ({ ...d, label: format(parseISO(d.data), "EEE", { locale: ptBR }) }))} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-border bg-background p-2 text-xs shadow-lg">Nota: {payload[0].value}</div>
                      ) : null
                    }
                  />
                  <Line type="monotone" dataKey="nota" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      {insights.length > 0 && (
        <Card className="space-y-2 p-5 shadow-sm">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground">
            <Lightbulb className="h-4 w-4" />
            Padrões
          </h3>
          <ul className="space-y-1.5">
            {insights.map((texto) => (
              <li key={texto} className="text-sm text-muted-foreground">{texto}</li>
            ))}
          </ul>
        </Card>
      )}

      {distracaoHojeSegundos === null && (
        <p className="text-xs text-muted-foreground">
          Distração/apps não aparecem porque o monitoramento de app ativo está desligado (Administração → Jarvis → Privacidade).
        </p>
      )}
    </div>
  );
}
