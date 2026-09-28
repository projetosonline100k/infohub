import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "critical" | "warning" | "good" | "neutral";
  // Texto auxiliar opcional embaixo do número (ex.: "3 desde ontem") — só
  // aparece quando quem chama tiver um dado real pra mostrar; nunca inventa
  // tendência/percentual sem dado por trás.
  hint?: string;
}

const TONE_CLASSES: Record<StatTileProps["tone"], string> = {
  critical: "bg-status-danger/10 text-status-danger",
  warning: "bg-status-warning/10 text-status-warning",
  good: "bg-status-success/10 text-status-success",
  neutral: "bg-muted text-muted-foreground",
};

// Card de métrica do redesign visual (item 5) — ícone com selo colorido,
// label pequena, número grande, borda discreta + hover sutil em vez do
// card branco/shadow pesada de antes. Mesma API de props, então
// DashGeral.tsx/Clientes.tsx não mudam de lógica ao usar isso.
export const StatTile = ({ icon: Icon, label, value, tone, hint }: StatTileProps) => {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold leading-tight text-foreground">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};
