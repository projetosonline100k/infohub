import { useCallback, useState } from "react";
import { format, startOfDay, addDays } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { useJarvisConfig } from "@/hooks/useJarvisConfig";
import {
  buscarRelatorioDoDia,
  salvarRelatorio,
  type DadosDoPlanoParaRelatorio,
  type RelatorioDiario,
  type RespostasQuestionario,
} from "@/lib/productivity/DailyReportService";
import { buscarProgressoDoDia } from "@/lib/productivity/DailyPlanService";
import { calcularMetricasDoDia, type MetricasAutomaticasDia } from "@/lib/productivity/DailyProductivityMetrics";

export type TipoQuestao = "escala" | "texto" | "escolha" | "simnao" | "hora";

export interface OpcaoQuestao {
  valor: string;
  label: string;
}

export interface QuestaoConfig {
  campo: keyof RespostasQuestionario;
  tipo: TipoQuestao;
  titulo: string;
  min?: number;
  max?: number;
  placeholder?: string;
  opcoes?: OpcaoQuestao[];
  // Só pergunta 3 (bloqueio) tem um campo de texto condicional quando a
  // opção "outro" é escolhida — os outros ignoram isto.
  campoOutro?: keyof RespostasQuestionario;
}

import { OPCOES_BLOQUEIO } from "@/lib/productivity/DailyReportService";

// As 8 perguntas do pedido, uma por tela (item 3) — configuração central
// usada tanto pela validação abaixo quanto pela UI (EndOfDayQuestionScreen),
// pra não precisar de 8 componentes quase idênticos.
export const QUESTOES: QuestaoConfig[] = [
  { campo: "productivityScore", tipo: "escala", titulo: "De 0 a 10, quão produtivo você foi hoje?", min: 0, max: 10 },
  { campo: "mainWin", tipo: "texto", titulo: "Qual foi sua principal vitória hoje?", placeholder: "Ex: Finalizei a oferta" },
  { campo: "mainBlocker", tipo: "escolha", titulo: "O que mais te atrapalhou?", opcoes: [...OPCOES_BLOQUEIO], campoOutro: "mainBlockerOther" },
  { campo: "completedMainPriority", tipo: "simnao", titulo: "Você concluiu a tarefa mais importante do dia?" },
  { campo: "pendingForTomorrow", tipo: "texto", titulo: "O que ficou pendente para amanhã?", placeholder: "Ex: Revisar o roteiro" },
  { campo: "energyScore", tipo: "escala", titulo: "Como estava sua energia hoje?", min: 1, max: 5 },
  { campo: "focusScore", tipo: "escala", titulo: "Como estava seu foco hoje?", min: 1, max: 5 },
  { campo: "tomorrowMainPriority", tipo: "texto", titulo: "Qual é a prioridade número 1 de amanhã?", placeholder: "Ex: Gravar os anúncios" },
  { campo: "plannedBedTime", tipo: "hora", titulo: "Que horas você pretende dormir hoje?" },
];

const RESPOSTAS_VAZIAS: RespostasQuestionario = {
  productivityScore: 5,
  energyScore: 3,
  focusScore: 3,
  mainWin: "",
  mainBlocker: null,
  mainBlockerOther: "",
  completedMainPriority: false,
  pendingForTomorrow: "",
  tomorrowMainPriority: "",
  plannedBedTime: "",
};

export type EstadoEndOfDay = "carregando" | "intro" | "ja_existe" | "questionario" | "rotinas" | "salvando" | "resumo";

// "Você definiu de manhã: #1 {título}" (integração com Começar o dia) —
// título + status ATUAL (não o de quando o plano foi criado) da atividade
// que era a prioridade #1 do plano de hoje, se existir um.
export interface PrioridadeDoDiaInfo {
  titulo: string;
  concluida: boolean;
}

export function useEndOfDayFlow() {
  const { user } = useAuth();
  const { monitorarAppAtivo } = useJarvisConfig();
  const [estado, setEstado] = useState<EstadoEndOfDay>("carregando");
  const [relatorioExistente, setRelatorioExistente] = useState<RelatorioDiario | null>(null);
  const [indiceQuestao, setIndiceQuestao] = useState(0);
  const [respostas, setRespostas] = useState<RespostasQuestionario>(RESPOSTAS_VAZIAS);
  const [relatorioSalvo, setRelatorioSalvo] = useState<RelatorioDiario | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [prioridadeDoDiaInfo, setPrioridadeDoDiaInfo] = useState<PrioridadeDoDiaInfo | null>(null);

  const dataStr = format(new Date(), "yyyy-MM-dd");

  // Chamado toda vez que o fluxo abre (não só na primeira montagem — o
  // painel do Jarvis existe o tempo todo, então "montar uma vez" não basta
  // pra "verificar de novo cada vez que a pessoa aperta ⌘+Shift+E").
  const abrir = useCallback(async () => {
    setEstado("carregando");
    setIndiceQuestao(0);
    setRespostas(RESPOSTAS_VAZIAS);
    setRelatorioSalvo(null);
    setErro(null);
    setPrioridadeDoDiaInfo(null);
    if (!user) return;
    try {
      const existente = await buscarRelatorioDoDia(user.id, dataStr);
      setRelatorioExistente(existente);
      setEstado(existente ? "ja_existe" : "intro");
    } catch {
      setEstado("intro");
    }
    // "Você definiu de manhã: #1 X" — busca à parte, sem travar a decisão
    // intro/já-existe acima nela (se falhar, cai pro comportamento genérico
    // de sempre: pergunta "concluiu a principal tarefa?" do zero).
    try {
      const progresso = await buscarProgressoDoDia(user.id, dataStr);
      const p1Id = progresso?.plano.main_priority_activity_id;
      const p1 = p1Id ? progresso?.atividades.find((a) => a.id === p1Id) : null;
      setPrioridadeDoDiaInfo(p1 ? { titulo: p1.titulo, concluida: p1.concluida } : null);
    } catch {
      setPrioridadeDoDiaInfo(null);
    }
  }, [user, dataStr]);

  const comecar = useCallback(() => setEstado("questionario"), []);

  // "Ver relatório" (quando já existe) — mostra a MESMA tela de resumo do
  // fluxo recém-concluído, sem passar de novo pelo questionário.
  const verExistente = useCallback(() => {
    if (!relatorioExistente) return;
    setRelatorioSalvo(relatorioExistente);
    setEstado("resumo");
  }, [relatorioExistente]);

  // "Atualizar relatório" (quando já existe) — pré-preenche as respostas
  // com o que já foi salvo, em vez de começar do zero.
  const atualizar = useCallback(() => {
    if (relatorioExistente) {
      setRespostas({
        productivityScore: relatorioExistente.productivity_score,
        energyScore: relatorioExistente.energy_score,
        focusScore: relatorioExistente.focus_score,
        mainWin: relatorioExistente.main_win ?? "",
        mainBlocker: relatorioExistente.main_blocker,
        mainBlockerOther: relatorioExistente.main_blocker_other ?? "",
        completedMainPriority: relatorioExistente.completed_main_priority,
        pendingForTomorrow: relatorioExistente.pending_for_tomorrow ?? "",
        tomorrowMainPriority: relatorioExistente.tomorrow_main_priority ?? "",
        plannedBedTime: relatorioExistente.planned_bed_time?.slice(0, 5) ?? "",
      });
    }
    setIndiceQuestao(0);
    setEstado("questionario");
  }, [relatorioExistente]);

  const responder = useCallback(<K extends keyof RespostasQuestionario>(campo: K, valor: RespostasQuestionario[K]) => {
    setRespostas((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  const podeAvancar = useCallback(() => {
    const questao = QUESTOES[indiceQuestao];
    if (!questao) return true;
    if (questao.tipo === "texto") return true; // todos os textos são opcionais
    if (questao.campo === "mainBlocker") {
      if (!respostas.mainBlocker) return true; // opcional também
      if (respostas.mainBlocker === "outro") return respostas.mainBlockerOther.trim().length > 0;
    }
    return true;
  }, [indiceQuestao, respostas]);

  const avancar = useCallback(() => {
    if (!podeAvancar()) return;
    if (indiceQuestao < QUESTOES.length - 1) setIndiceQuestao((i) => i + 1);
  }, [indiceQuestao, podeAvancar]);

  // "← Voltar" preserva as respostas (item TESTE 2) — o estado já vive
  // neste hook, trocar só o índice não apaga nada.
  const voltar = useCallback(() => {
    if (indiceQuestao > 0) setIndiceQuestao((i) => i - 1);
  }, [indiceQuestao]);

  const finalizar = useCallback(async () => {
    if (!user) return;
    setEstado("salvando");
    setErro(null);
    try {
      // Reconfere o status da prioridade #1 BEM antes de salvar (correção
      // #8) — não confia no valor lido quando o questionário abriu, a
      // pessoa pode ter concluído a tarefa nesse meio tempo.
      let completedMainPriority = respostas.completedMainPriority;
      let dadosDoPlano: DadosDoPlanoParaRelatorio | undefined;
      try {
        const progresso = await buscarProgressoDoDia(user.id, dataStr);
        if (progresso) {
          const p1Id = progresso.plano.main_priority_activity_id;
          const p1 = p1Id ? progresso.atividades.find((a) => a.id === p1Id) : null;
          if (p1) completedMainPriority = p1.concluida;
          dadosDoPlano = {
            dailyPlanId: progresso.plano.id,
            eightyTwentyCompletedCount: progresso.atividades.filter((a) => a.concluida).length,
            eightyTwentyTotalCount: progresso.atividades.length,
          };
        }
      } catch {
        /* sem plano hoje (ou falha ao reconferir) — mantém a resposta manual */
      }

      const inicio = startOfDay(new Date());
      const fim = addDays(inicio, 1);
      const metricas: MetricasAutomaticasDia = await calcularMetricasDoDia(
        dataStr,
        inicio.toISOString(),
        fim.toISOString(),
        monitorarAppAtivo
      );
      const salvo = await salvarRelatorio(user.id, dataStr, { ...respostas, completedMainPriority }, metricas, dadosDoPlano);
      setRelatorioSalvo(salvo);
      setEstado("resumo");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o relatório.");
      setEstado("questionario");
    }
  }, [user, dataStr, respostas, monitorarAppAtivo]);

  // Chamado pelo botão da última pergunta (item 18, correção #9): quem
  // decide SE existe uma etapa "Rotinas de hoje" é useEndOfDayRoutines (via
  // EndOfDayFlow.tsx, que já aguardou o carregamento antes de chamar isto)
  // — aqui só reage. Sem hábitos pendentes, comportamento idêntico a antes
  // (direto pro finalizar), zero mudança pra quem nunca usou Performance.
  const avancarOuFinalizar = useCallback((temRotinasPendentes: boolean) => {
    if (temRotinasPendentes) {
      setEstado("rotinas");
    } else {
      void finalizar();
    }
  }, [finalizar]);

  const continuarDeRotinas = useCallback(() => {
    void finalizar();
  }, [finalizar]);

  return {
    estado,
    dataStr,
    relatorioExistente,
    indiceQuestao,
    totalQuestoes: QUESTOES.length,
    questaoAtual: QUESTOES[indiceQuestao],
    respostas,
    relatorioSalvo,
    erro,
    prioridadeDoDiaInfo,
    abrir,
    comecar,
    verExistente,
    atualizar,
    responder,
    avancar,
    voltar,
    podeAvancar: podeAvancar(),
    avancarOuFinalizar,
    continuarDeRotinas,
    finalizar,
    cancelar: () => setEstado("intro"),
  };
}
