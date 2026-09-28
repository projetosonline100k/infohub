import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AtividadeDoPlano, PlanoDiario } from "@/lib/productivity/DailyPlanService";

interface AssistantFocoDeHojeSectionProps {
  plano: PlanoDiario | null;
  atividades: AtividadeDoPlano[];
  prioridadeUm: AtividadeDoPlano | null;
  onAbrirComecarDia: () => void;
  onSelecionarTarefa: (id: string) => void;
}

// "FOCO DE HOJE" — as até-3 atividades do 80/20 definidas em "Começar o
// dia", com a prioridade #1 em destaque (🔥) e progresso "N de M
// concluídas". Busca própria (via useDailyPlan, repassado por quem chama),
// não a lista viva do Jarvis — que remove uma tarefa assim que ela é
// concluída, o que faria essa seção "perder" a concluída na hora (correção
// #1 do plano). Clicar numa já concluída não abre a tela de foco de novo
// (seria um no-op silencioso, ela já nem está mais em `tarefas`).
export function AssistantFocoDeHojeSection({ plano, atividades, prioridadeUm, onAbrirComecarDia, onSelecionarTarefa }: AssistantFocoDeHojeSectionProps) {
  if (!plano || atividades.length === 0) return null;

  const ordenadas = [...atividades].sort((a, b) => a.position - b.position);
  const concluidasCount = ordenadas.filter((a) => a.concluida).length;

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <button
        type="button"
        onClick={onAbrirComecarDia}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground hover:text-primary"
      >
        <Flame className="h-3.5 w-3.5 text-primary" />
        Foco de hoje · {concluidasCount}/{ordenadas.length}
      </button>
      <div className="space-y-0.5">
        {ordenadas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              if (!a.concluida) onSelecionarTarefa(a.id);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
              a.concluida ? "text-muted-foreground" : "text-foreground hover:bg-muted/60"
            )}
          >
            <span aria-hidden="true">{a.concluida ? "✓" : prioridadeUm?.id === a.id ? "🔥" : "○"}</span>
            <span className="min-w-0 flex-1 truncate">{a.titulo}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
