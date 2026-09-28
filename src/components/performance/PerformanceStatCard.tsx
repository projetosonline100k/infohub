import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tom = "good" | "neutral" | "warning" | "critical";

interface PerformanceStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  variacaoPercentual?: number | null;
  progresso?: number;
  tone?: Tom;
}

const TONE_ICONE: Record<Tom, string> = {
  good: "bg-status-success/15 text-status-success",
  neutral: "bg-primary/15 text-primary",
  warning: "bg-status-warning/15 text-status-warning",
  critical: "bg-status-danger/15 text-status-danger",
};

const TONE_BARRA: Record<Tom, string> = {
  good: "bg-status-success",
  neutral: "bg-primary",
  warning: "bg-status-warning",
  critical: "bg-status-danger",
};

// Card do topo da Visão geral — ícone + valor grande + variação (↑/↓ %,
// quando existe base de comparação) + barra de progresso simples (não usa
// o <Progress> do shadcn porque a cor do preenchimento precisa variar por
// tom, e aquele componente fixa `bg-primary` no indicador).
export function PerformanceStatCard({ icon: Icon, label, value, variacaoPercentual, progresso, tone = "neutral" }: PerformanceStatCardProps) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-start justify-between">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", TONE_ICONE[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        {variacaoPercentual != null && (
          <span className={cn("flex items-center gap-0.5 text-xs font-medium", variacaoPercentual >= 0 ? "text-status-success" : "text-status-danger")}>
            {variacaoPercentual >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(variacaoPercentual)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </div>
      {progresso != null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full rounded-full transition-all", TONE_BARRA[tone])} style={{ width: `${Math.min(100, Math.max(0, progresso))}%` }} />
        </div>
      )}
    </Card>
  );
}
