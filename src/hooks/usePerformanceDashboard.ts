import { useCallback, useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, format, isSameWeek, parseISO, startOfMonth, endOfMonth, subDays } from "date-fns";
import { useAuth } from "@/auth/AuthProvider";
import { usePerformanceHabits } from "./usePerformanceHabits";
import { usePerformanceGoals } from "./usePerformanceGoals";
import { buscarLogsDoIntervalo, type Habito } from "@/lib/performance/PerformanceHabitService";
import type { Meta } from "@/lib/performance/PerformanceGoalService";
import { buscarProgressoDoDia, type AtividadeDoPlano, type PlanoDiario } from "@/lib/productivity/DailyPlanService";
import { buscarRelatorioDoDia, type RelatorioDiario } from "@/lib/productivity/DailyReportService";
import { calcularAutomaticoDoIntervalo, type AutomaticKey, type ResultadoAutomatico } from "@/lib/performance/PerformanceAutomaticSources";
import {
  calcularConsistencia,
  calcularScoreDoDia,
  calcularVariacaoPercentual,
  montarLinhaDoHabito,
  type LinhaHabito,
  type ProgressoMeta,
} from "@/lib/performance/PerformanceMetricsService";

// Referência fixa de foco profundo pro "Score do dia" quando ninguém
// configurou um hábito automático "Horas de foco" com meta própria — 4h é
// só uma referência documentada, nunca escondida (ver StartDayFlow: 4h já
// é uma das opções de "tempo disponível").
const META_FOCO_PADRAO_HORAS = 4;
const DIAS_HISTORICO = 15; // hoje + 14 dias — cobre semana atual/anterior e o gráfico de 7 dias

interface PontoSerie {
  data: string;
  score: number;
  focoHoras: number;
}

export interface PerformanceDashboardData {
  loading: boolean;
  dataSelecionada: string;

  scoreHoje: number;
  scoreVariacao: number | null;

  consistenciaSemanaPercentual: number;
  consistenciaSemanaVariacao: number | null;

  focoHojeHoras: number;
  focoHojeVariacao: number | null;
  focoMetaHoras: number;

  tarefasConcluidasHoje: number;

  rotinasConcluidasHoje: number;
  rotinasPrevistasHoje: number;

  serieUltimos7Dias: PontoSerie[];

  planoDoDia: PlanoDiario | null;
  atividadesDoPlano: AtividadeDoPlano[];
  relatorioDoDia: RelatorioDiario | null;

  linhasHabitosHoje: LinhaHabito[];
  semanaAtualGrid: { habito: Habito; linhas: LinhaHabito[] }[];
  consistenciaMesPercentual: number;

  metas: Meta[];
  progressos: Map<string, ProgressoMeta>;

  refetch: () => void;
}

// Agrega tudo que a "Visão geral" nova precisa numa passada só. Todo número
// aqui é objetivo e rastreável até uma tabela real (ver
// PerformanceMetricsService.calcularScoreDoDia) — "Score do dia" É uma
// média ponderada documentada, não um score de IA opaco.
export function usePerformanceDashboard(dataSelecionada: string): PerformanceDashboardData {
  const { user } = useAuth();
  const { habitosAtivos, loading: loadingHabitos } = usePerformanceHabits();
  const { metas, progressos, loading: loadingMetas } = usePerformanceGoals();
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<
    Omit<PerformanceDashboardData, "loading" | "dataSelecionada" | "refetch" | "metas" | "progressos">
  >({
    scoreHoje: 0,
    scoreVariacao: null,
    consistenciaSemanaPercentual: 0,
    consistenciaSemanaVariacao: null,
    focoHojeHoras: 0,
    focoHojeVariacao: null,
    focoMetaHoras: META_FOCO_PADRAO_HORAS,
    tarefasConcluidasHoje: 0,
    rotinasConcluidasHoje: 0,
    rotinasPrevistasHoje: 0,
    serieUltimos7Dias: [],
    planoDoDia: null,
    atividadesDoPlano: [],
    relatorioDoDia: null,
    linhasHabitosHoje: [],
    semanaAtualGrid: [],
    consistenciaMesPercentual: 0,
  });

  const inicioStr = format(subDays(parseISO(dataSelecionada), DIAS_HISTORICO - 1), "yyyy-MM-dd");
  const todosDias = useMemo(
    () => eachDayOfInterval({ start: parseISO(inicioStr), end: parseISO(dataSelecionada) }).map((d) => format(d, "yyyy-MM-dd")),
    [inicioStr, dataSelecionada]
  );

  const carregar = useCallback(async () => {
    if (!user || loadingHabitos) return;
    setLoading(true);
    try {
      const manuais = habitosAtivos.filter((h) => h.source === "manual");
      const automaticosConfigurados = habitosAtivos.filter((h) => h.source === "automatic");

      const [logs, planoHoje, relatorioHoje] = await Promise.all([
        manuais.length > 0 ? buscarLogsDoIntervalo(user.id, inicioStr, dataSelecionada) : Promise.resolve([]),
        buscarProgressoDoDia(user.id, dataSelecionada),
        buscarRelatorioDoDia(user.id, dataSelecionada),
      ]);
      const logsPorChave = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l]));

      // Focus/tarefas/prioridade #1 são estatísticas embutidas do painel —
      // calculadas sempre, independente de a pessoa ter criado um hábito
      // "automático" pra elas ou não.
      const chavesEmbutidas: AutomaticKey[] = ["focus_hours", "tasks_completed", "priority_one_completed"];
      const chavesExtras = Array.from(new Set(automaticosConfigurados.map((h) => h.automatic_key as AutomaticKey))).filter(
        (k) => !chavesEmbutidas.includes(k)
      );
      const todasChaves = [...chavesEmbutidas, ...chavesExtras];
      const resultadosPorChave = new Map<AutomaticKey, Map<string, ResultadoAutomatico>>();
      await Promise.all(
        todasChaves.map(async (k) => resultadosPorChave.set(k, await calcularAutomaticoDoIntervalo(k, user.id, inicioStr, dataSelecionada)))
      );

      const automaticoDoHabitoNoDia = (h: Habito, d: string) =>
        h.source === "automatic" ? resultadosPorChave.get(h.automatic_key as AutomaticKey)?.get(d) ?? null : null;

      // Linhas de TODOS os hábitos ativos em TODOS os dias do histórico —
      // base pra consistência (hoje/semana/mês) e pro grid da semana.
      const linhasPorDia = new Map<string, LinhaHabito[]>();
      todosDias.forEach((d) => {
        linhasPorDia.set(
          d,
          habitosAtivos.map((h) => montarLinhaDoHabito(h, d, logsPorChave.get(`${h.id}:${d}`) ?? null, automaticoDoHabitoNoDia(h, d)))
        );
      });

      const linhasHabitosHoje = linhasPorDia.get(dataSelecionada) ?? [];
      const consistenciaHoje = calcularConsistencia(linhasHabitosHoje);

      const focoPorDia = (d: string) => resultadosPorChave.get("focus_hours")?.get(d)?.valueNumeric ?? 0;
      const tarefasPorDia = (d: string) => resultadosPorChave.get("tasks_completed")?.get(d)?.valueNumeric ?? 0;
      const prioridadeStatusPorDia = (d: string) => resultadosPorChave.get("priority_one_completed")?.get(d)?.statusBooleano ?? "nao_aplicavel";

      const habitoFocoAutomatico = habitosAtivos.find((h) => h.source === "automatic" && h.automatic_key === "focus_hours");
      const focoMetaHoras = habitoFocoAutomatico?.meta_diaria ?? META_FOCO_PADRAO_HORAS;

      const scoreDoDia = (d: string) => {
        const consistenciaDia = calcularConsistencia(linhasPorDia.get(d) ?? []).percentual;
        const statusP1 = prioridadeStatusPorDia(d);
        return calcularScoreDoDia({
          consistenciaHojePercentual: consistenciaDia,
          focoHojeHoras: focoPorDia(d),
          metaFocoHorasReferencia: focoMetaHoras,
          prioridadeUmConcluida: statusP1 === "nao_aplicavel" ? null : statusP1 === "concluida",
          tarefasConcluidasHoje: tarefasPorDia(d),
        });
      };

      const ultimos7 = todosDias.slice(-7);
      const serieUltimos7Dias: PontoSerie[] = ultimos7.map((d) => ({ data: d, score: scoreDoDia(d), focoHoras: focoPorDia(d) }));

      const indiceOntem = todosDias.length - 2;
      const scoreHoje = scoreDoDia(dataSelecionada);
      const scoreOntem = indiceOntem >= 0 ? scoreDoDia(todosDias[indiceOntem]) : null;

      // Semana atual (do início da semana até a data selecionada) vs os
      // MESMOS dias da semana anterior (mesma contagem de dias, pra não
      // comparar 2 dias desta semana com 7 da passada).
      const diasSemanaAtual = todosDias.filter((d) => isSameWeek(parseISO(d), parseISO(dataSelecionada), { weekStartsOn: 1 }));
      const diasSemanaAnterior = diasSemanaAtual.map((d) => format(subDays(parseISO(d), 7), "yyyy-MM-dd")).filter((d) => todosDias.includes(d));

      const linhasSemanaAtual = diasSemanaAtual.flatMap((d) => linhasPorDia.get(d) ?? []);
      const linhasSemanaAnterior = diasSemanaAnterior.flatMap((d) => linhasPorDia.get(d) ?? []);
      const consistenciaSemanaAtual = calcularConsistencia(linhasSemanaAtual);
      const consistenciaSemanaAnterior = calcularConsistencia(linhasSemanaAnterior);

      const focoSemanaAtual = diasSemanaAtual.reduce((s, d) => s + focoPorDia(d), 0);
      const focoSemanaAnterior = diasSemanaAnterior.reduce((s, d) => s + focoPorDia(d), 0);

      // Grid "semana atual" pro mini card de Meu mês (só os hábitos com
      // pelo menos um dia programado nessa janela, pra não listar hábito
      // criado ontem com a semana inteira em branco).
      const semanaAtualGrid = habitosAtivos
        .map((h) => ({ habito: h, linhas: diasSemanaAtual.map((d) => (linhasPorDia.get(d) ?? []).find((l) => l.habito.id === h.id)!) }))
        .filter((g) => g.linhas.some((l) => l.programado));

      // Consistência do mês (pro anel) — só os dias já cobertos pelo
      // histórico de 15 dias que caem dentro do mês da data selecionada;
      // simplificação documentada (não busca o mês inteiro à parte só pro
      // anel da prévia — o mês completo de verdade mora na aba "Meu mês").
      const inicioMes = format(startOfMonth(parseISO(dataSelecionada)), "yyyy-MM-dd");
      const fimMes = format(endOfMonth(parseISO(dataSelecionada)), "yyyy-MM-dd");
      const diasDoMesNoHistorico = todosDias.filter((d) => d >= inicioMes && d <= fimMes);
      const consistenciaMes = calcularConsistencia(diasDoMesNoHistorico.flatMap((d) => linhasPorDia.get(d) ?? []));

      setDados({
        scoreHoje,
        scoreVariacao: scoreOntem != null ? calcularVariacaoPercentual(scoreHoje, scoreOntem) : null,
        consistenciaSemanaPercentual: consistenciaSemanaAtual.percentual,
        consistenciaSemanaVariacao:
          diasSemanaAnterior.length === diasSemanaAtual.length
            ? calcularVariacaoPercentual(consistenciaSemanaAtual.percentual, consistenciaSemanaAnterior.percentual)
            : null,
        focoHojeHoras: focoPorDia(dataSelecionada),
        focoHojeVariacao:
          diasSemanaAnterior.length === diasSemanaAtual.length ? calcularVariacaoPercentual(focoSemanaAtual, focoSemanaAnterior) : null,
        focoMetaHoras: focoMetaHoras,
        tarefasConcluidasHoje: tarefasPorDia(dataSelecionada),
        rotinasConcluidasHoje: consistenciaHoje.concluidos,
        rotinasPrevistasHoje: consistenciaHoje.programados,
        serieUltimos7Dias,
        planoDoDia: planoHoje?.plano ?? null,
        atividadesDoPlano: planoHoje?.atividades ?? [],
        relatorioDoDia: relatorioHoje,
        linhasHabitosHoje,
        semanaAtualGrid,
        consistenciaMesPercentual: consistenciaMes.percentual,
      });
    } finally {
      setLoading(false);
    }
  }, [user, loadingHabitos, habitosAtivos, dataSelecionada, inicioStr, todosDias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { ...dados, loading: loading || loadingHabitos || loadingMetas, dataSelecionada, refetch: carregar, metas, progressos };
}
