import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OPCOES_BLOQUEIO_PLANO } from "@/lib/productivity/DailyPlanService";
import type { RespostasPlano } from "@/hooks/useStartDayFlow";
import { StartDayFocoTimeline } from "./StartDayFocoTimeline";

interface StartDayQuestionScreenProps {
  tipo: "obrigatorio" | "tempo" | "bloqueio";
  respostas: RespostasPlano;
  onResponder: <K extends keyof RespostasPlano>(campo: K, valor: RespostasPlano[K]) => void;
}

// Irmão de EndOfDayQuestionScreen.tsx, mas não compartilhado (os dois
// rituais têm perguntas e regras próprias) — só cobre as 3 perguntas finais
// genéricas do plano matinal (80/20 e prioridade #1 são telas dedicadas,
// ver StartDayActivityPicker/StartDayPickPriorityOne). Visual calmo, mesmo
// critério do irmão: sem transições chamativas, uma pergunta por tela.
export function StartDayQuestionScreen({ tipo, respostas, onResponder }: StartDayQuestionScreenProps) {
  if (tipo === "obrigatorio") {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium leading-snug">O que é obrigatório entregar hoje, aconteça o que acontecer?</h3>
        <Textarea
          value={respostas.mandatoryOutcome}
          onChange={(e) => onResponder("mandatoryOutcome", e.target.value)}
          placeholder="Ex: Enviar a proposta pro cliente X"
          rows={4}
          autoFocus
          className="resize-none"
        />
      </div>
    );
  }

  if (tipo === "tempo") {
    // As 24h do dia numa régua (como a Agenda): marca os blocos de foco arrastando.
    return <StartDayFocoTimeline onMudar={(min) => onResponder("focusTimeAvailableMinutes", min)} />;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium leading-snug">O que pode atrapalhar hoje?</h3>
      <div className="grid grid-cols-2 gap-2">
        {OPCOES_BLOQUEIO_PLANO.map((op) => (
          <button
            key={op.valor}
            type="button"
            onClick={() => onResponder("expectedBlocker", respostas.expectedBlocker === op.valor ? null : op.valor)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              respostas.expectedBlocker === op.valor ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {op.label}
          </button>
        ))}
      </div>
      {respostas.expectedBlocker === "outro" && (
        <Input
          autoFocus
          placeholder="Qual?"
          value={respostas.expectedBlockerOther}
          onChange={(e) => onResponder("expectedBlockerOther", e.target.value)}
        />
      )}
    </div>
  );
}
