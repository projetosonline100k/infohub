import { usePerformanceToday } from "@/hooks/usePerformanceToday";
import { PerformanceHabitRow } from "@/components/performance/PerformanceHabitRow";

const LIMITE_JARVIS = 4;

interface AssistantRotinasSectionProps {
  onVerPerformance: () => void;
}

// "ROTINAS" no Jarvis (item 16) — até 4 hábitos (por ordem) pra não lotar o
// painel 460x620. Boolean clicável direto; numérico só leitura (clique leva
// pra Performance completa, sem apertar um popover numérico no espaço
// pequeno do Jarvis).
export function AssistantRotinasSection({ onVerPerformance }: AssistantRotinasSectionProps) {
  const { linhasProgramadas, loading, registrarBooleano } = usePerformanceToday();

  if (loading || linhasProgramadas.length === 0) return null;

  const visiveis = linhasProgramadas.slice(0, LIMITE_JARVIS);

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Rotinas</p>
      <div className="space-y-0.5">
        {visiveis.map((linha) => (
          <PerformanceHabitRow key={linha.habito.id} linha={linha} onRegistrarBooleano={registrarBooleano} compact onClickCompactNumero={onVerPerformance} />
        ))}
      </div>
      <button type="button" onClick={onVerPerformance} className="text-xs text-muted-foreground hover:text-foreground">
        Ver performance
      </button>
    </div>
  );
}
