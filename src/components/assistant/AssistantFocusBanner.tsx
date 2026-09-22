import { cn } from "@/lib/utils";

interface AssistantFocusBannerProps {
  titulo: string;
  tempo: string;
  pausado: boolean;
}

// Lembrete compacto do foco ativo, mostrado em cima de QUALQUER aba que não
// seja "Hoje" (que já mostra o estado completo) — item 8: não perder a
// tarefa em foco de vista ao navegar Projeto/Kanban/Docs/Notas.
export function AssistantFocusBanner({ titulo, tempo, pausado }: AssistantFocusBannerProps) {
  return (
    <div className={cn("flex items-center gap-2 border-b border-border px-4 py-2 text-xs", pausado ? "bg-amber-500/10" : "bg-cyan-500/10")}>
      <span className={cn("shrink-0 font-bold tabular-nums", pausado ? "text-amber-500" : "text-cyan-500")}>
        {pausado ? "⏸" : "🔥"} {tempo}
      </span>
      <span className="truncate text-muted-foreground">{titulo}</span>
    </div>
  );
}
