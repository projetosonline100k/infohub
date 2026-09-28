import { useEffect } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useEndOfDayFlow } from "@/hooks/useEndOfDayFlow";
import { useEndOfDayRoutines } from "@/hooks/useEndOfDayRoutines";
import { EndOfDayQuestionScreen } from "./EndOfDayQuestionScreen";
import { EndOfDayRoutinesStep } from "./EndOfDayRoutinesStep";
import { EndOfDaySummary } from "./EndOfDaySummary";

interface EndOfDayFlowProps {
  onClose: () => void;
  onDiaEncerrado: () => void;
  onVerRelatorioCompleto: () => void;
}

// Item 19 do pedido: orquestrador — cada tela (intro/já existe/pergunta/
// resumo) é seu próprio bloco simples aqui dentro, a lógica de verdade mora
// em useEndOfDayFlow. Cabe nos 460x620 fixos da janela do Jarvis (não tem
// modo "tela cheia" — ver AssistantPanel.tsx), por isso nada aqui pressupõe
// mais espaço do que isso.
export function EndOfDayFlow({ onClose, onDiaEncerrado, onVerRelatorioCompleto }: EndOfDayFlowProps) {
  const flow = useEndOfDayFlow();
  const routines = useEndOfDayRoutines();

  // Reabre e reconfere "já existe relatório hoje?" toda vez que o fluxo é
  // aberto — não só na primeira montagem (o componente pode ficar montado
  // e ser reaberto várias vezes no mesmo dia via ⌘+Shift+E).
  useEffect(() => {
    void flow.abrir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (flow.estado === "resumo") onDiaEncerrado();
  }, [flow.estado, onDiaEncerrado]);

  if (flow.estado === "carregando") {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (flow.estado === "intro") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
        <p className="text-4xl" aria-hidden="true">🌙</p>
        <h2 className="text-lg font-semibold text-foreground">Vamos encerrar o dia?</h2>
        <p className="text-sm text-muted-foreground">Leva menos de 2 minutos.</p>
        <div className="flex w-full flex-col gap-2 pt-4">
          <Button type="button" onClick={flow.comecar}>Começar relatório</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Agora não</Button>
        </div>
      </div>
    );
  }

  if (flow.estado === "ja_existe" && flow.relatorioExistente) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
        <p className="text-4xl" aria-hidden="true">🌙</p>
        <h2 className="text-lg font-semibold text-foreground">Você já encerrou seu dia hoje.</h2>
        <div className="flex w-full flex-col gap-2 pt-4">
          <Button type="button" onClick={flow.verExistente}>Ver relatório</Button>
          <Button type="button" variant="outline" onClick={flow.atualizar}>Atualizar relatório</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    );
  }

  if (flow.estado === "questionario") {
    const ultima = flow.indiceQuestao === flow.totalQuestoes - 1;
    // "Você definiu de manhã: #1 X" — só nesta pergunta específica e só
    // quando existe um plano de hoje com prioridade #1; troca a tela
    // genérica sim/não por um bloco somente-leitura com o status já
    // derivado da atividade real (não pergunta de novo o que já se sabe).
    const perguntaComPlano = flow.questaoAtual.campo === "completedMainPriority" && flow.prioridadeDoDiaInfo;
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between pb-2">
          <button
            type="button"
            onClick={flow.indiceQuestao === 0 ? onClose : flow.voltar}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {flow.indiceQuestao === 0 ? "Cancelar" : "Voltar"}
          </button>
          <span className="text-xs text-muted-foreground">{flow.indiceQuestao + 1} de {flow.totalQuestoes}</span>
        </div>
        <Progress value={((flow.indiceQuestao + 1) / flow.totalQuestoes) * 100} className="h-1 shrink-0" />

        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          {perguntaComPlano ? (
            <div className="space-y-3">
              <h3 className="text-lg font-medium leading-snug">Você definiu de manhã:</h3>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                <p className="text-sm text-muted-foreground">Prioridade #1</p>
                <p className="text-base font-medium text-foreground">{flow.prioridadeDoDiaInfo?.titulo}</p>
                <p className={cn("mt-1 text-sm", flow.prioridadeDoDiaInfo?.concluida ? "text-emerald-500" : "text-muted-foreground")}>
                  {flow.prioridadeDoDiaInfo?.concluida ? "✓ Concluída" : "○ Não concluída"}
                </p>
              </div>
            </div>
          ) : (
            <EndOfDayQuestionScreen questao={flow.questaoAtual} respostas={flow.respostas} onResponder={flow.responder} />
          )}
        </div>

        {flow.erro && <p className="pb-2 text-xs text-destructive">{flow.erro}</p>}
        <Button
          type="button"
          disabled={!flow.podeAvancar}
          onClick={async () => {
            if (!ultima) {
              flow.avancar();
              return;
            }
            await routines.aguardarCarregamento();
            flow.avancarOuFinalizar(routines.temPendencias);
          }}
        >
          {ultima ? "Concluir" : "Próxima"}
        </Button>
      </div>
    );
  }

  if (flow.estado === "rotinas") {
    return (
      <EndOfDayRoutinesStep
        pendentes={routines.pendentes}
        respostas={routines.respostas}
        onResponderBooleano={routines.responderBooleano}
        onResponderNumero={routines.responderNumero}
        onContinuar={async () => {
          await routines.salvarTudo();
          flow.continuarDeRotinas();
        }}
      />
    );
  }

  if (flow.estado === "salvando") {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Salvando...</div>;
  }

  if (flow.estado === "resumo" && flow.relatorioSalvo) {
    return <EndOfDaySummary relatorio={flow.relatorioSalvo} onFechar={onClose} onVerRelatorioCompleto={onVerRelatorioCompleto} />;
  }

  return (
    <div className="flex h-full items-center justify-center">
      <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

