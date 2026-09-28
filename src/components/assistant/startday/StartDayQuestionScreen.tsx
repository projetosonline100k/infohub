import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OPCOES_BLOQUEIO_PLANO } from "@/lib/productivity/DailyPlanService";
import type { RespostasPlano } from "@/hooks/useStartDayFlow";

const OPCOES_TEMPO = [
  { valor: 60, label: "1h" },
  { valor: 120, label: "2h" },
  { valor: 180, label: "3h" },
  { valor: 240, label: "4h" },
  { valor: 300, label: "5h+" },
];

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
  const [mostrarCustom, setMostrarCustom] = useState(false);

  useEffect(() => {
    if (tipo !== "tempo") return;
    setMostrarCustom(
      respostas.focusTimeAvailableMinutes != null && !OPCOES_TEMPO.some((o) => o.valor === respostas.focusTimeAvailableMinutes)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

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
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium leading-snug">Quanto tempo real de foco você tem hoje?</h3>
        <div className="grid grid-cols-3 gap-2">
          {OPCOES_TEMPO.map((op) => (
            <button
              key={op.valor}
              type="button"
              onClick={() => {
                setMostrarCustom(false);
                onResponder("focusTimeAvailableMinutes", op.valor);
              }}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                !mostrarCustom && respostas.focusTimeAvailableMinutes === op.valor
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {op.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setMostrarCustom(true);
              if (OPCOES_TEMPO.some((o) => o.valor === respostas.focusTimeAvailableMinutes)) {
                onResponder("focusTimeAvailableMinutes", null);
              }
            }}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              mostrarCustom ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            Personalizado
          </button>
        </div>
        {mostrarCustom && (
          <Input
            type="number"
            min={1}
            autoFocus
            value={respostas.focusTimeAvailableMinutes ?? ""}
            onChange={(e) => onResponder("focusTimeAvailableMinutes", e.target.value ? Number(e.target.value) : null)}
            placeholder="Minutos"
          />
        )}
      </div>
    );
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
