import { format, isToday, isTomorrow } from "date-fns";
import { BellRing } from "lucide-react";
import { cn } from "@/lib/utils";

// Sino no card quando a atividade tem alarme: mostra quando vai tocar e
// pulsa se o horário já passou (está tocando/aguardando resposta).
export function IndicadorAlarme({ alarmeEm, concluida, className }: { alarmeEm?: string | null; concluida?: boolean; className?: string }) {
  if (!alarmeEm || concluida) return null;
  const quando = new Date(alarmeEm);
  const passou = quando.getTime() <= Date.now();
  const rotulo = isToday(quando) ? format(quando, "HH:mm") : isTomorrow(quando) ? `amanhã ${format(quando, "HH:mm")}` : format(quando, "dd/MM HH:mm");
  return (
    <span
      title={`Alarme ${format(quando, "dd/MM/yyyy 'às' HH:mm")}`}
      className={cn("flex shrink-0 items-center gap-0.5 text-[11px] font-medium", passou ? "animate-pulse text-amber-500" : "text-primary", className)}
    >
      <BellRing className="h-3 w-3" />
      {rotulo}
    </span>
  );
}
