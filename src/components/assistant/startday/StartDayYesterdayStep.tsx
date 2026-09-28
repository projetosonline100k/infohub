import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import type { AssistantTarefa, ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";
import type { SugestaoDeOntem } from "@/lib/productivity/DailyPlanService";
import { StartDayCreateActivityForm } from "./StartDayCreateActivityForm";

interface StartDayYesterdayStepProps {
  sugestao: SugestaoDeOntem;
  projetos: AssistantProjetoOpcao[];
  projetoIdAtual: string | null;
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<AssistantTarefa>;
  onUsarExistente: () => void;
  onCriada: (atividade: AssistantTarefa) => void;
  onIgnorar: () => void;
}

// "Ontem → Hoje": mostra a prioridade de amanhã que a pessoa definiu no
// Encerrar o dia anterior — nunca cria nada sozinho. Se já existe uma
// atividade aberta com o mesmo título, oferece usá-la direto; senão,
// oferece criar (ação explícita) ou ignorar e escolher do zero no 80/20.
export function StartDayYesterdayStep({
  sugestao,
  projetos,
  projetoIdAtual,
  colunasDoProjeto,
  onCriarAtividade,
  onUsarExistente,
  onCriada,
  onIgnorar,
}: StartDayYesterdayStepProps) {
  const [criando, setCriando] = useState(false);

  if (criando) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-medium leading-snug">Criar essa atividade</h3>
        <StartDayCreateActivityForm
          projetos={projetos}
          projetoIdPadrao={projetoIdAtual}
          tituloInicial={sugestao.texto}
          colunasDoProjeto={colunasDoProjeto}
          onCriar={onCriarAtividade}
          onCriada={onCriada}
          onCancelar={() => setCriando(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
      <p className="text-4xl" aria-hidden="true">🌅</p>
      <h2 className="text-lg font-semibold text-foreground">Ontem você definiu como prioridade:</h2>
      <p className="text-base font-medium text-foreground">"{sugestao.texto}"</p>
      <div className="flex w-full flex-col gap-2 pt-4">
        {sugestao.tarefaExistenteId ? (
          <>
            <Button type="button" onClick={onUsarExistente}>Já é minha prioridade hoje</Button>
            <Button type="button" variant="outline" onClick={onIgnorar}>Ignorar, vou escolher agora</Button>
          </>
        ) : (
          <>
            <Button type="button" onClick={() => setCriando(true)}>Criar essa atividade</Button>
            <Button type="button" variant="outline" onClick={onIgnorar}>Ignorar, vou escolher agora</Button>
          </>
        )}
      </div>
    </div>
  );
}
