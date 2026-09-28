import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn, formatarTempo } from "@/lib/utils";
import { usePerformanceHabits } from "@/hooks/usePerformanceHabits";
import { habitoProgramadoNoDia } from "@/lib/performance/PerformanceMetricsService";
import type { AtividadeDoPlano, PlanoDiario } from "@/lib/productivity/DailyPlanService";
import type { Habito } from "@/lib/performance/PerformanceHabitService";

interface StartDaySummaryProps {
  plano: PlanoDiario;
  atividades: AtividadeDoPlano[];
  onComecarPrioridadeUm: (id: string) => void;
  onAjustarPlano: () => void;
  onFinalizar: () => void;
}

function rotuloMeta(h: Habito): string {
  if (!h.meta_diaria) return h.nome;
  if (h.tipo === "paginas") return `Ler ${h.meta_diaria} páginas`;
  if (h.tipo === "minutos") return `${h.nome} — ${h.meta_diaria} min`;
  if (h.tipo === "horas") return `${h.nome} — ${h.meta_diaria}h`;
  if (h.tipo === "numero") return `${h.nome} — ${h.meta_diaria}${h.unidade ? ` ${h.unidade}` : ""}`;
  return h.nome;
}

// "Rotinas previstas hoje" (item 17) — só um resumo do que já está
// programado via Performance, NUNCA uma pergunta nova (não mexe na
// numeração 1-5 do questionário acima). Some por completo se não houver
// nenhum hábito manual programado hoje.
function RotinasPrevistasHoje() {
  const { habitosAtivos, loading } = usePerformanceHabits();
  const hoje = format(new Date(), "yyyy-MM-dd");
  const previstas = habitosAtivos.filter((h) => h.source === "manual" && habitoProgramadoNoDia(h, hoje));

  if (loading || previstas.length === 0) return null;

  return (
    <div className="w-full space-y-1 border-t border-border/60 pt-3 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rotinas previstas hoje</p>
      {previstas.map((h) => (
        <p key={h.id} className="text-xs text-muted-foreground">{rotuloMeta(h)}</p>
      ))}
    </div>
  );
}

// "Seu foco de hoje" — resumo final do ritual, mesmo tom "só fatos, sem
// nota secreta" de EndOfDaySummary.tsx. A prioridade #1 fica em destaque
// (🔥), as demais aparecem simples, com ✓/○ conforme o status atual.
export function StartDaySummary({ plano, atividades, onComecarPrioridadeUm, onAjustarPlano, onFinalizar }: StartDaySummaryProps) {
  const ordenadas = [...atividades].sort((a, b) => a.position - b.position);
  const p1 = plano.main_priority_activity_id ? ordenadas.find((a) => a.id === plano.main_priority_activity_id) ?? null : null;
  const outras = ordenadas.filter((a) => a.id !== plano.main_priority_activity_id);
  const estimadoTotal = ordenadas.reduce((soma, a) => soma + (a.tempoEstimado || 0), 0);
  const disponivel = plano.focus_time_available_minutes;
  const excedeu = disponivel != null && estimadoTotal > disponivel;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto px-1 py-4 text-center">
      <p className="text-4xl" aria-hidden="true">🔥</p>
      <h2 className="text-lg font-semibold text-foreground">Seu foco de hoje</h2>

      <div className="w-full space-y-1.5 text-left">
        {p1 && (
          <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">🔥 Prioridade #1</p>
            <p className="text-sm font-medium text-foreground">{p1.titulo}</p>
          </div>
        )}
        {outras.map((a) => (
          <div key={a.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-sm text-foreground">{a.concluida ? "✓ " : "○ "}{a.titulo}</p>
          </div>
        ))}
      </div>

      {disponivel != null && (
        <p className={cn("text-xs", excedeu ? "text-destructive" : "text-muted-foreground")}>
          Estimado: {formatarTempo(estimadoTotal)} · Disponível: {formatarTempo(disponivel)}
          {excedeu ? " — pode não caber tudo hoje." : ""}
        </p>
      )}

      <RotinasPrevistasHoje />

      <div className="flex w-full flex-col gap-2 pt-2">
        {p1 && !p1.concluida && (
          <Button type="button" onClick={() => onComecarPrioridadeUm(p1.id)}>Começar #1</Button>
        )}
        <Button type="button" variant="outline" onClick={onAjustarPlano}>Ajustar plano</Button>
        <Button type="button" onClick={onFinalizar}>Finalizar</Button>
      </div>
    </div>
  );
}
