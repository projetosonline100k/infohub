import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RespostaRotina } from "@/hooks/useEndOfDayRoutines";
import type { LinhaHabito } from "@/lib/performance/PerformanceMetricsService";

interface EndOfDayRoutinesStepProps {
  pendentes: LinhaHabito[];
  respostas: Map<string, RespostaRotina>;
  onResponderBooleano: (habitId: string, completed: boolean) => void;
  onResponderNumero: (habitId: string, value: number) => void;
  onContinuar: () => void;
}

function tituloPergunta(habito: { nome: string; tipo: string }): string {
  if (habito.tipo === "paginas") return `Quantas páginas você leu hoje? (${habito.nome})`;
  if (habito.tipo === "minutos") return `Quantos minutos você fez de "${habito.nome}"?`;
  if (habito.tipo === "horas") return `Quantas horas você fez de "${habito.nome}"?`;
  return habito.nome;
}

function RotinaPendenteRow({
  linha,
  resposta,
  onResponderBooleano,
  onResponderNumero,
}: {
  linha: LinhaHabito;
  resposta?: RespostaRotina;
  onResponderBooleano: (id: string, completed: boolean) => void;
  onResponderNumero: (id: string, value: number) => void;
}) {
  const { habito } = linha;
  const [valor, setValor] = useState("");

  if (habito.tipo === "boolean") {
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-foreground">{habito.nome}</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={resposta?.completed === true ? "default" : "outline"} className="flex-1" onClick={() => onResponderBooleano(habito.id, true)}>
            Fiz
          </Button>
          <Button type="button" size="sm" variant={resposta?.completed === false ? "default" : "outline"} className="flex-1" onClick={() => onResponderBooleano(habito.id, false)}>
            Não fiz
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-foreground">{tituloPergunta(habito)}</p>
      <Input
        type="number"
        min={0}
        value={resposta?.valueNumeric ?? valor}
        onChange={(e) => {
          setValor(e.target.value);
          onResponderNumero(habito.id, Number(e.target.value) || 0);
        }}
        className="h-9 w-28"
      />
    </div>
  );
}

// "ROTINAS DE HOJE" no Encerrar o dia (item 18) — todos os hábitos MANUAIS
// pendentes numa tela só (modelo diferente do resto do questionário, que é
// uma pergunta por tela) — automáticos já ficam de fora antes de chegar
// aqui (ver useEndOfDayRoutines.ts). Tudo opcional/pulável.
export function EndOfDayRoutinesStep({ pendentes, respostas, onResponderBooleano, onResponderNumero, onContinuar }: EndOfDayRoutinesStepProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
        <h3 className="text-lg font-medium leading-snug">Rotinas de hoje</h3>
        <div className="space-y-4">
          {pendentes.map((linha) => (
            <RotinaPendenteRow
              key={linha.habito.id}
              linha={linha}
              resposta={respostas.get(linha.habito.id)}
              onResponderBooleano={onResponderBooleano}
              onResponderNumero={onResponderNumero}
            />
          ))}
        </div>
      </div>
      <Button type="button" onClick={onContinuar}>Continuar</Button>
    </div>
  );
}
