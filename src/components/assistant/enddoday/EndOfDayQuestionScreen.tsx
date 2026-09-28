import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { QuestaoConfig } from "@/hooks/useEndOfDayFlow";
import type { RespostasQuestionario } from "@/lib/productivity/DailyReportService";

interface EndOfDayQuestionScreenProps {
  questao: QuestaoConfig;
  respostas: RespostasQuestionario;
  onResponder: <K extends keyof RespostasQuestionario>(campo: K, valor: RespostasQuestionario[K]) => void;
}

// Uma pergunta por tela (item 3) — dirigido por QuestaoConfig em vez de 8
// componentes quase idênticos. Visual calmo de propósito (item 8): sem
// transições chamativas, cores neutras, nada piscando.
export function EndOfDayQuestionScreen({ questao, respostas, onResponder }: EndOfDayQuestionScreenProps) {
  const valor = respostas[questao.campo];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium leading-snug">{questao.titulo}</h3>

      {questao.tipo === "escala" && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: (questao.max as number) - (questao.min as number) + 1 }, (_, i) => (questao.min as number) + i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onResponder(questao.campo, n as never)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-colors",
                valor === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {questao.tipo === "texto" && (
        <Textarea
          value={(valor as string) ?? ""}
          onChange={(e) => onResponder(questao.campo, e.target.value as never)}
          placeholder={questao.placeholder}
          rows={4}
          autoFocus
          className="resize-none"
        />
      )}

      {questao.tipo === "escolha" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {questao.opcoes?.map((op) => (
              <button
                key={op.valor}
                type="button"
                onClick={() => onResponder(questao.campo, op.valor as never)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  valor === op.valor ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {op.label}
              </button>
            ))}
          </div>
          {valor === "outro" && questao.campoOutro && (
            <Input
              autoFocus
              placeholder="Qual?"
              value={(respostas[questao.campoOutro] as string) ?? ""}
              onChange={(e) => onResponder(questao.campoOutro as never, e.target.value as never)}
            />
          )}
        </div>
      )}

      {questao.tipo === "hora" && (
        <Input
          type="time"
          autoFocus
          value={(valor as string) ?? ""}
          onChange={(e) => onResponder(questao.campo, e.target.value as never)}
          className="w-32"
        />
      )}

      {questao.tipo === "simnao" && (
        <div className="flex gap-2">
          <Button type="button" variant={valor === true ? "default" : "outline"} className="flex-1" onClick={() => onResponder(questao.campo, true as never)}>
            Sim
          </Button>
          <Button type="button" variant={valor === false ? "default" : "outline"} className="flex-1" onClick={() => onResponder(questao.campo, false as never)}>
            Não
          </Button>
        </div>
      )}
    </div>
  );
}
