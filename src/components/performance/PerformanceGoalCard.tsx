import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Meta } from "@/lib/performance/PerformanceGoalService";
import type { ProgressoMeta } from "@/lib/performance/PerformanceMetricsService";

const LABEL_UNIDADE: Record<string, string> = { numero: "", minutos: "min", horas: "h", paginas: "páginas", percentual: "%" };

const arred = (tipo: string, n: number) => (tipo === "horas" ? n.toFixed(1) : String(Math.round(n)));

interface PerformanceGoalCardProps {
  meta: Meta;
  progresso: ProgressoMeta;
  onEditar: () => void;
}

// "Academia 13/20 treinos" com barra de progresso (item 9) — sem score
// mágico, só o número real vs o alvo.
export function PerformanceGoalCard({ meta, progresso, onEditar }: PerformanceGoalCardProps) {
  const unidade = meta.unit ?? LABEL_UNIDADE[meta.tipo] ?? "";
  const texto =
    meta.tipo === "percentual"
      ? `${arred("numero", progresso.atual)}%`
      : `${arred(meta.tipo, progresso.atual)}/${arred(meta.tipo, progresso.alvo)} ${unidade}`.trim();

  return (
    <button type="button" onClick={onEditar} className="w-full text-left">
      <Card className="space-y-2 p-4 transition-colors hover:border-primary/40">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{meta.nome}</p>
          <span className={cn("shrink-0 text-xs font-medium", progresso.percentual >= 100 ? "text-status-success" : "text-muted-foreground")}>
            {texto}
          </span>
        </div>
        <Progress value={Math.min(100, progresso.percentual)} className="h-1.5" />
      </Card>
    </button>
  );
}
