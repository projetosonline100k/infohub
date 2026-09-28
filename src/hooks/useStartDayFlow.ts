import { useCallback, useState } from "react";
import { format, subDays } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import {
  buscarPlanoDoDia,
  buscarSugestaoDeOntem,
  salvarPlano,
  type PlanoDiario,
  type SugestaoDeOntem,
} from "@/lib/productivity/DailyPlanService";

export type EstadoStartDay = "carregando" | "intro" | "ja_existe" | "sono" | "ontem" | "questionario" | "salvando" | "resumo";

export interface RespostasPlano {
  // Até 3 IDs REAIS de atividades (nunca cópias) — o 80/20 do dia.
  activityIds: string[];
  mainPriorityActivityId: string | null;
  mandatoryOutcome: string;
  focusTimeAvailableMinutes: number | null;
  expectedBlocker: string | null;
  expectedBlockerOther: string;
}

const RESPOSTAS_VAZIAS: RespostasPlano = {
  activityIds: [],
  mainPriorityActivityId: null,
  mandatoryOutcome: "",
  focusTimeAvailableMinutes: null,
  expectedBlocker: null,
  expectedBlockerOther: "",
};

// 80/20 → prioridade #1 → obrigatório → tempo disponível → bloqueio — os
// dois primeiros são telas dedicadas (StartDayActivityPicker/
// StartDayPickPriorityOne, não genéricas); só os 3 últimos usam
// StartDayQuestionScreen. "Ontem"/intro ficam FORA dessa contagem (mesmo
// critério do "1 de N" em useEndOfDayFlow.ts).
export const TOTAL_QUESTOES_PLANO = 5;

// Máquina de estado do ritual matinal — mesmo desenho de useEndOfDayFlow.ts
// (carregando|intro|ja_existe|questionario|salvando|resumo), com um passo a
// mais ("ontem") entre intro e questionario quando existe uma sugestão da
// noite anterior.
export function useStartDayFlow() {
  const { user } = useAuth();
  const [estado, setEstado] = useState<EstadoStartDay>("carregando");
  const [planoExistente, setPlanoExistente] = useState<PlanoDiario | null>(null);
  const [sugestaoDeOntem, setSugestaoDeOntem] = useState<SugestaoDeOntem | null>(null);
  const [indiceQuestao, setIndiceQuestao] = useState(0);
  const [respostas, setRespostas] = useState<RespostasPlano>(RESPOSTAS_VAZIAS);
  const [planoSalvo, setPlanoSalvo] = useState<PlanoDiario | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const dataStr = format(new Date(), "yyyy-MM-dd");

  // Chamado toda vez que o fluxo abre, não só na primeira montagem — o
  // painel do Jarvis existe o tempo todo (mesmo critério de EndOfDayFlow).
  const abrir = useCallback(async () => {
    setEstado("carregando");
    setIndiceQuestao(0);
    setRespostas(RESPOSTAS_VAZIAS);
    setPlanoSalvo(null);
    setErro(null);
    if (!user) return;
    try {
      const existente = await buscarPlanoDoDia(user.id, dataStr);
      setPlanoExistente(existente);
      if (existente) {
        setEstado("ja_existe");
        return;
      }
      setEstado("intro");
    } catch {
      setEstado("intro");
    }
  }, [user, dataStr]);

// Compartilhado entre "Começar" (intro) e "Continuar" (depois do passo de
  // sono) — decide entre o passo "ontem" (sugestão da noite anterior) e ir
  // direto pro questionário.
  const avancarParaOntemOuQuestionario = useCallback(async () => {
    if (!user) {
      setEstado("questionario");
      return;
    }
    try {
      const ontemStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
      const sugestao = await buscarSugestaoDeOntem(user.id, ontemStr);
      if (sugestao) {
        setSugestaoDeOntem(sugestao);
        setEstado("ontem");
        return;
      }
    } catch {
      /* sem sugestão de ontem — segue pro questionário normalmente */
    }
    setEstado("questionario");
  }, [user]);

  // Chamado pelo botão "Começar" da intro — quem decide SE existe o passo
  // "Como foi sua noite?" é useStartDaySleep (via StartDayFlow.tsx, que já
  // aguardou o carregamento antes de chamar isto). Já tem sleep_log hoje →
  // comportamento idêntico a antes, direto pro resto do ritual.
  const comecar = useCallback(
    async (jaTemRegistroDeSono: boolean) => {
      if (!jaTemRegistroDeSono) {
        setEstado("sono");
        return;
      }
      await avancarParaOntemOuQuestionario();
    },
    [avancarParaOntemOuQuestionario]
  );

  const continuarDeSono = useCallback(() => {
    void avancarParaOntemOuQuestionario();
  }, [avancarParaOntemOuQuestionario]);

  // "Ontem → Hoje": usa a atividade aberta que já bate com o título (se
  // existir) — nunca cria nada sozinho aqui (criar é uma ação explícita no
  // próprio seletor 80/20, ver StartDayCreateActivityForm).
  const usarSugestaoDeOntem = useCallback(() => {
    const id = sugestaoDeOntem?.tarefaExistenteId;
    if (id) {
      setRespostas((prev) => (prev.activityIds.includes(id) ? prev : { ...prev, activityIds: [...prev.activityIds, id] }));
    }
    setEstado("questionario");
  }, [sugestaoDeOntem]);

  const ignorarSugestaoDeOntem = useCallback(() => setEstado("questionario"), []);

  // "Ver plano" (quando já existe) — mesma tela de resumo do fluxo recém-
  // concluído.
  const verExistente = useCallback(() => {
    if (!planoExistente) return;
    setPlanoSalvo(planoExistente);
    setEstado("resumo");
  }, [planoExistente]);

  // Pré-preenche as respostas com o plano atual antes de reabrir o
  // questionário — quem chama (StartDayFlow.tsx) monta `valores` a partir
  // do progresso já carregado (useDailyPlan), pra não duplicar a busca.
  const ajustar = useCallback((valores: RespostasPlano) => {
    setRespostas(valores);
    setIndiceQuestao(0);
    setEstado("questionario");
  }, []);

  const responder = useCallback(<K extends keyof RespostasPlano>(campo: K, valor: RespostasPlano[K]) => {
    setRespostas((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  // 80/20: alterna seleção (até 3) — tirar uma atividade que era a
  // prioridade #1 também limpa essa escolha (não pode sobrar apontando pra
  // uma atividade fora da lista).
  const alternarAtividade = useCallback((id: string) => {
    setRespostas((prev) => {
      if (prev.activityIds.includes(id)) {
        return {
          ...prev,
          activityIds: prev.activityIds.filter((a) => a !== id),
          mainPriorityActivityId: prev.mainPriorityActivityId === id ? null : prev.mainPriorityActivityId,
        };
      }
      if (prev.activityIds.length >= 3) return prev;
      return { ...prev, activityIds: [...prev.activityIds, id] };
    });
  }, []);

  // Criar uma atividade nova dentro do fluxo já a seleciona automaticamente
  // no 80/20 (item explícito do pedido) — sem isso a pessoa teria que
  // procurar a tarefa recém-criada na lista pra marcá-la.
  const adicionarAtividadeCriada = useCallback((id: string) => {
    setRespostas((prev) =>
      prev.activityIds.includes(id) || prev.activityIds.length >= 3 ? prev : { ...prev, activityIds: [...prev.activityIds, id] }
    );
  }, []);

  const podeAvancar = useCallback(() => {
    if (indiceQuestao === 0) return respostas.activityIds.length > 0;
    if (indiceQuestao === 1) return !!respostas.mainPriorityActivityId;
    if (indiceQuestao === 2) return respostas.mandatoryOutcome.trim().length > 0;
    if (indiceQuestao === 3) return !!respostas.focusTimeAvailableMinutes && respostas.focusTimeAvailableMinutes > 0;
    if (indiceQuestao === 4) {
      if (respostas.expectedBlocker === "outro") return respostas.expectedBlockerOther.trim().length > 0;
      return true; // bloqueio em si é opcional
    }
    return true;
  }, [indiceQuestao, respostas]);

  const avancar = useCallback(() => {
    if (!podeAvancar()) return;
    if (indiceQuestao < TOTAL_QUESTOES_PLANO - 1) setIndiceQuestao((i) => i + 1);
  }, [indiceQuestao, podeAvancar]);

  const voltar = useCallback(() => {
    if (indiceQuestao > 0) setIndiceQuestao((i) => i - 1);
  }, [indiceQuestao]);

  const finalizar = useCallback(async () => {
    if (!user) return;
    setEstado("salvando");
    setErro(null);
    try {
      const salvo = await salvarPlano(user.id, dataStr, {
        mainPriorityActivityId: respostas.mainPriorityActivityId,
        focusTimeAvailableMinutes: respostas.focusTimeAvailableMinutes,
        mandatoryOutcome: respostas.mandatoryOutcome,
        expectedBlocker: respostas.expectedBlocker,
        expectedBlockerOther: respostas.expectedBlockerOther,
        activityIds: respostas.activityIds,
      });
      setPlanoSalvo(salvo);
      setEstado("resumo");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o plano.");
      setEstado("questionario");
    }
  }, [user, dataStr, respostas]);

  return {
    estado,
    dataStr,
    planoExistente,
    sugestaoDeOntem,
    indiceQuestao,
    totalQuestoes: TOTAL_QUESTOES_PLANO,
    respostas,
    planoSalvo,
    erro,
    abrir,
    comecar,
    continuarDeSono,
    usarSugestaoDeOntem,
    ignorarSugestaoDeOntem,
    verExistente,
    ajustar,
    responder,
    alternarAtividade,
    adicionarAtividadeCriada,
    avancar,
    voltar,
    podeAvancar: podeAvancar(),
    finalizar,
    cancelar: () => setEstado("intro"),
  };
}
