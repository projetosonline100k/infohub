import { useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePerformanceMonth } from "@/hooks/usePerformanceMonth";
import { PerformanceMonthGrid } from "./PerformanceMonthGrid";
import { PerformanceCircularTracker } from "./PerformanceCircularTracker";
import { SleepMonthCard } from "@/components/sleep/SleepMonthCard";

type Visualizacao = "grid" | "circular";

// "Meu mês" (item 11/12) — switcher Grid/Circular, Grid por padrão (item
// 12: "no mobile/painel pequeno, priorizar Grid" — Grid já é o padrão em
// qualquer tamanho de tela).
export function PerformanceMonthTracker() {
  const [mesRef, setMesRef] = useState(new Date());
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("grid");
  const { habitos, dias, linhasPorHabito, loading } = usePerformanceMonth(mesRef);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMesRef((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="w-32 text-center text-sm font-medium capitalize text-foreground">{format(mesRef, "MMMM yyyy", { locale: ptBR })}</p>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMesRef((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setVisualizacao("grid")}
            className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", visualizacao === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setVisualizacao("circular")}
            className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", visualizacao === "circular" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Circular
          </button>
        </div>
      </div>

      <SleepMonthCard mesRef={mesRef} />

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : habitos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma rotina ainda.</p>
      ) : visualizacao === "grid" ? (
        <PerformanceMonthGrid habitos={habitos} dias={dias} linhasPorHabito={linhasPorHabito} />
      ) : (
        <PerformanceCircularTracker habitos={habitos} dias={dias} linhasPorHabito={linhasPorHabito} />
      )}
    </div>
  );
}
