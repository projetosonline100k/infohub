import { useState } from "react";
import { Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePerformanceHistory, type FiltroHistorico, type PeriodoPersonalizado } from "@/hooks/usePerformanceHistory";
import { SleepHistory } from "@/components/sleep/SleepHistory";

const OPCOES_FILTRO: { valor: FiltroHistorico; label: string }[] = [
  { valor: "7dias", label: "7 dias" },
  { valor: "30dias", label: "30 dias" },
  { valor: "este_mes", label: "Este mês" },
  { valor: "mes_anterior", label: "Mês anterior" },
  { valor: "personalizado", label: "Personalizado" },
];

// Histórico (item 14/15) — total/média/consistência/streaks por hábito.
// Streak mostrado discretamente (🔥 N dias), sem moedas/XP/níveis (item 15).
export function PerformanceHistory() {
  const [filtro, setFiltro] = useState<FiltroHistorico>("30dias");
  const [personalizado, setPersonalizado] = useState<PeriodoPersonalizado>({ inicio: "", fim: "" });
  const { estatisticas, loading } = usePerformanceHistory(filtro, personalizado);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {OPCOES_FILTRO.map((op) => (
          <button
            key={op.valor}
            type="button"
            onClick={() => setFiltro(op.valor)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filtro === op.valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {op.label}
          </button>
        ))}
      </div>

      {filtro === "personalizado" && (
        <div className="flex items-center gap-2">
          <Input type="date" value={personalizado.inicio} onChange={(e) => setPersonalizado((p) => ({ ...p, inicio: e.target.value }))} className="h-8 w-40" />
          <Input type="date" value={personalizado.fim} onChange={(e) => setPersonalizado((p) => ({ ...p, fim: e.target.value }))} className="h-8 w-40" />
        </div>
      )}

      <SleepHistory filtro={filtro} personalizado={personalizado} />

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : estatisticas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma rotina ainda.</p>
      ) : (
        <div className="space-y-2">
          {estatisticas.map(({ habito, total, media, consistencia, streaks }) => (
            <Card key={habito.id} className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{habito.nome}</p>
                {streaks.atual > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Flame className="h-3 w-3" />
                    {streaks.atual} dias
                  </span>
                )}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="text-foreground">{Math.round(total)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Média</p>
                  <p className="text-foreground">{media != null ? media.toFixed(1) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Consistência</p>
                  <p className="text-foreground">{consistencia.percentual.toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Melhor sequência</p>
                  <p className="text-foreground">{streaks.melhor}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
