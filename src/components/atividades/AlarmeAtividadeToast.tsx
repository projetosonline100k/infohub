import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

// Aviso do alarme de uma atividade (ver useAlarmesAgenda). "OK" para o
// alarme de vez (não toca mais); "Adiar" toca de novo em 10 min; "Concluir"
// conclui a atividade. Fechar no "x" só silencia esta vez — sem resposta, o
// alarme volta a tocar a cada 5 minutos.
export function AlarmeAtividadeToast({ titulo, descricao, onConcluir, onAdiar, onDesligar, onFechar }: {
  titulo: string;
  descricao: string;
  onConcluir: () => void;
  onAdiar: () => void;
  onDesligar: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="w-[360px] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex items-start gap-2">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{titulo}</p>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
        <button type="button" onClick={onFechar} className="text-xs text-muted-foreground hover:text-foreground" aria-label="Silenciar por agora">✕</button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="h-8 flex-1 text-xs font-semibold" onClick={onDesligar} title="Para o alarme (não toca mais)">OK</Button>
        <Button size="sm" variant="secondary" className="h-8 flex-1 text-xs" onClick={onAdiar}>Adiar 10 min</Button>
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={onConcluir}>Concluir</Button>
      </div>
    </div>
  );
}
