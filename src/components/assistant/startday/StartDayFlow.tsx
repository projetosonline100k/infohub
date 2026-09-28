import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/auth/AuthProvider";
import { useStartDayFlow } from "@/hooks/useStartDayFlow";
import { useStartDaySleep } from "@/hooks/useStartDaySleep";
import { buscarProgressoDoDia, type AtividadeDoPlano } from "@/lib/productivity/DailyPlanService";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import type { AssistantTarefa, ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";
import { StartDaySleepStep } from "./StartDaySleepStep";
import { StartDayYesterdayStep } from "./StartDayYesterdayStep";
import { StartDayActivityPicker } from "./StartDayActivityPicker";
import { StartDayPickPriorityOne } from "./StartDayPickPriorityOne";
import { StartDayQuestionScreen } from "./StartDayQuestionScreen";
import { StartDaySummary } from "./StartDaySummary";

interface StartDayFlowProps {
  onClose: () => void;
  onPlanoSalvo: () => void;
  onComecarPrioridadeUm: (activityId: string) => void;
  tarefas: AssistantTarefa[];
  projetos: AssistantProjetoOpcao[];
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<AssistantTarefa>;
  projetoIdAtual: string | null;
}

// Orquestrador — irmão de EndOfDayFlow.tsx (mesma máquina de estado, mesmo
// respeito aos 460x620 fixos da janela do Jarvis), mas com um passo a mais
// ("ontem") e duas telas dedicadas (80/20, prioridade #1) em vez de um
// único componente genérico de pergunta.
export function StartDayFlow({
  onClose,
  onPlanoSalvo,
  onComecarPrioridadeUm,
  tarefas,
  projetos,
  colunasDoProjeto,
  onCriarAtividade,
  projetoIdAtual,
}: StartDayFlowProps) {
  const { user } = useAuth();
  const flow = useStartDayFlow();
  const sono = useStartDaySleep();
  const [atividadesResumo, setAtividadesResumo] = useState<AtividadeDoPlano[]>([]);

  useEffect(() => {
    void flow.abrir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (flow.estado === "resumo") onPlanoSalvo();
  }, [flow.estado, onPlanoSalvo]);

  // Carrega as atividades do plano (incluindo concluídas) sempre que existe
  // um plano pra mostrar/ajustar — usado pelo resumo E por "Ajustar plano".
  useEffect(() => {
    const plano = flow.estado === "ja_existe" ? flow.planoExistente : flow.estado === "resumo" ? flow.planoSalvo : null;
    if (!user || !plano) return;
    let cancelado = false;
    buscarProgressoDoDia(user.id, flow.dataStr).then((progresso) => {
      if (!cancelado) setAtividadesResumo(progresso?.atividades ?? []);
    });
    return () => {
      cancelado = true;
    };
  }, [user, flow.estado, flow.planoExistente, flow.planoSalvo, flow.dataStr]);

  const handleAjustar = () => {
    const planoAtual = flow.estado === "resumo" ? flow.planoSalvo : flow.planoExistente;
    flow.ajustar({
      activityIds: atividadesResumo.map((a) => a.id),
      mainPriorityActivityId: planoAtual?.main_priority_activity_id ?? null,
      mandatoryOutcome: planoAtual?.mandatory_outcome ?? "",
      focusTimeAvailableMinutes: planoAtual?.focus_time_available_minutes ?? null,
      expectedBlocker: planoAtual?.expected_blocker ?? null,
      expectedBlockerOther: planoAtual?.expected_blocker_other ?? "",
    });
  };

  if (flow.estado === "carregando") {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (flow.estado === "intro") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
        <p className="text-4xl" aria-hidden="true">🌅</p>
        <h2 className="text-lg font-semibold text-foreground">Vamos definir o que realmente importa hoje?</h2>
        <p className="text-sm text-muted-foreground">Leva menos de 2 minutos.</p>
        <div className="flex w-full flex-col gap-2 pt-4">
          <Button
            type="button"
            onClick={async () => {
              await sono.aguardarCarregamento();
              void flow.comecar(sono.temRegistro);
            }}
          >
            Começar
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Agora não</Button>
        </div>
      </div>
    );
  }

  if (flow.estado === "sono") {
    return <StartDaySleepStep onSalvar={sono.registrar} onContinuar={flow.continuarDeSono} />;
  }

  if (flow.estado === "ja_existe" && flow.planoExistente) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
        <p className="text-4xl" aria-hidden="true">🔥</p>
        <h2 className="text-lg font-semibold text-foreground">Você já planejou seu dia hoje.</h2>
        <div className="flex w-full flex-col gap-2 pt-4">
          <Button type="button" onClick={flow.verExistente}>Ver plano</Button>
          <Button type="button" variant="outline" onClick={handleAjustar}>Ajustar plano</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    );
  }

  if (flow.estado === "ontem" && flow.sugestaoDeOntem) {
    return (
      <StartDayYesterdayStep
        sugestao={flow.sugestaoDeOntem}
        projetos={projetos}
        projetoIdAtual={projetoIdAtual}
        colunasDoProjeto={colunasDoProjeto}
        onCriarAtividade={onCriarAtividade}
        onUsarExistente={flow.usarSugestaoDeOntem}
        onCriada={(atividade) => {
          flow.usarSugestaoDeOntem();
          flow.adicionarAtividadeCriada(atividade.id);
        }}
        onIgnorar={flow.ignorarSugestaoDeOntem}
      />
    );
  }

  if (flow.estado === "questionario") {
    const ultima = flow.indiceQuestao === flow.totalQuestoes - 1;
    const atividadesSelecionadasInfo = flow.respostas.activityIds.map((id) => {
      const t = tarefas.find((x) => x.id === id);
      if (t) return { id: t.id, titulo: t.titulo };
      const fora = atividadesResumo.find((a) => a.id === id);
      return { id, titulo: fora?.titulo ?? "Atividade" };
    });

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
          {flow.indiceQuestao === 0 && (
            <StartDayActivityPicker
              tarefas={tarefas}
              projetos={projetos}
              projetoIdAtual={projetoIdAtual}
              selecionadas={flow.respostas.activityIds}
              onAlternar={flow.alternarAtividade}
              colunasDoProjeto={colunasDoProjeto}
              onCriarAtividade={onCriarAtividade}
              onAtividadeCriada={flow.adicionarAtividadeCriada}
              atividadesForaDaLista={atividadesResumo.map((a) => ({ id: a.id, titulo: a.titulo }))}
            />
          )}
          {flow.indiceQuestao === 1 && (
            <StartDayPickPriorityOne
              atividades={atividadesSelecionadasInfo}
              valor={flow.respostas.mainPriorityActivityId}
              onEscolher={(id) => flow.responder("mainPriorityActivityId", id)}
            />
          )}
          {flow.indiceQuestao === 2 && (
            <StartDayQuestionScreen tipo="obrigatorio" respostas={flow.respostas} onResponder={flow.responder} />
          )}
          {flow.indiceQuestao === 3 && (
            <StartDayQuestionScreen tipo="tempo" respostas={flow.respostas} onResponder={flow.responder} />
          )}
          {flow.indiceQuestao === 4 && (
            <StartDayQuestionScreen tipo="bloqueio" respostas={flow.respostas} onResponder={flow.responder} />
          )}
        </div>

        {flow.erro && <p className="pb-2 text-xs text-destructive">{flow.erro}</p>}
        <Button type="button" disabled={!flow.podeAvancar} onClick={ultima ? flow.finalizar : flow.avancar}>
          {ultima ? "Concluir" : "Próxima"}
        </Button>
      </div>
    );
  }

  if (flow.estado === "salvando") {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Salvando...</div>;
  }

  if (flow.estado === "resumo" && flow.planoSalvo) {
    return (
      <StartDaySummary
        plano={flow.planoSalvo}
        atividades={atividadesResumo}
        onComecarPrioridadeUm={(id) => {
          onComecarPrioridadeUm(id);
        }}
        onAjustarPlano={handleAjustar}
        onFinalizar={onClose}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
