import { ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePerformanceToday } from "@/hooks/usePerformanceToday";
import { PerformanceHabitRow } from "./PerformanceHabitRow";

// "ROTINAS DE HOJE" — um dos 3 cards protagonistas da Visão geral.
export function PerformanceToday() {
  const { linhasProgramadas, loading, registrarBooleano, registrarNumero, concluidasCount, previstasCount } = usePerformanceToday();
  const progresso = previstasCount > 0 ? (concluidasCount / previstasCount) * 100 : 0;

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground">
        <ListChecks className="h-4 w-4 text-primary" />
        Rotinas de hoje
      </h3>

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Carregando rotinas...</p>
      ) : linhasProgramadas.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma rotina programada pra hoje.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-sm text-foreground">
              <span className="font-semibold">
                {concluidasCount} de {previstasCount}
              </span>{" "}
              concluídas
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
            </div>
          </div>
          <div className="flex-1 space-y-0.5 divide-y divide-border/60">
            {linhasProgramadas.map((linha) => (
              <PerformanceHabitRow key={linha.habito.id} linha={linha} onRegistrarBooleano={registrarBooleano} onRegistrarNumero={registrarNumero} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
