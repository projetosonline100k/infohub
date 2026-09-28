import { format, getDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { capitalizar } from "@/components/assistant/format";
import type { Habito } from "@/lib/performance/PerformanceHabitService";
import type { LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

interface PerformanceMonthMiniCardProps {
  mesRef: string;
  semanaAtualGrid: { habito: Habito; linhas: LinhaHabito[] }[];
  consistenciaMesPercentual: number;
  onAbrirMes: () => void;
}

const LETRA_DIA: Record<number, string> = { 1: "S", 2: "T", 3: "Q", 4: "Q", 5: "S", 6: "S", 0: "D" };

// "MEU MÊS" na Visão geral — um dos 3 cards protagonistas: consistência do
// mês + prévia do tracker (grid da SEMANA atual; o grid do mês inteiro fica
// na aba própria). Mesmos dados de usePerformanceDashboard, nada novo
// calculado aqui.
export function PerformanceMonthMiniCard({ mesRef, semanaAtualGrid, consistenciaMesPercentual, onAbrirMes }: PerformanceMonthMiniCardProps) {
  const grupos = semanaAtualGrid.slice(0, 4);
  const colunas = grupos[0]?.linhas ?? [];

  return (
    <button type="button" onClick={onAbrirMes} className="block h-full text-left">
      <Card className="flex h-full flex-col gap-3 p-5 transition-colors hover:border-primary/40">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground">
            <CalendarDays className="h-4 w-4 text-primary" />
            Meu mês
          </h3>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>

        <div>
          <p className="text-4xl font-bold text-foreground">{Math.round(consistenciaMesPercentual)}%</p>
          <p className="text-xs text-muted-foreground">
            de consistência · {capitalizar(format(parseISO(mesRef), "MMMM yyyy", { locale: ptBR }))}
          </p>
        </div>

        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma rotina ainda.</p>
        ) : (
          <div className="flex-1 space-y-1.5">
            <div className="grid items-center gap-1" style={{ gridTemplateColumns: `88px repeat(${colunas.length}, 1fr)` }}>
              <span />
              {colunas.map((l) => (
                <span key={l.date} className="text-center text-[10px] text-muted-foreground">
                  {LETRA_DIA[getDay(parseISO(l.date))]}
                </span>
              ))}
            </div>
            {grupos.map(({ habito, linhas }) => (
              <div key={habito.id} className="grid items-center gap-1" style={{ gridTemplateColumns: `88px repeat(${linhas.length}, 1fr)` }}>
                <span className="truncate text-xs text-muted-foreground">{habito.nome}</span>
                {linhas.map((l) => (
                  <span
                    key={l.date}
                    className={cn(
                      "mx-auto h-2 w-2 rounded-full",
                      !l.programado ? "bg-muted-foreground/20" : l.completed ? "bg-status-success" : "bg-muted-foreground/50"
                    )}
                  />
                ))}
              </div>
            ))}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] text-muted-foreground">
              {grupos.map(({ habito }) => (
                <span key={habito.id} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" />
                  <span className="truncate">{habito.nome}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    </button>
  );
}
