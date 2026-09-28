import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { MetricasAutomaticasDia } from "./DailyProductivityMetrics";

export type RelatorioDiario = Tables<"daily_productivity_reports">;

export const OPCOES_BLOQUEIO = [
  { valor: "celular", label: "Celular" },
  { valor: "redes_sociais", label: "Redes sociais" },
  { valor: "cansaco", label: "Cansaço" },
  { valor: "reunioes", label: "Reuniões" },
  { valor: "falta_clareza", label: "Falta de clareza" },
  { valor: "procrastinacao", label: "Procrastinação" },
  { valor: "interrupcoes", label: "Interrupções" },
  { valor: "outro", label: "Outro" },
] as const;

export interface RespostasQuestionario {
  productivityScore: number;
  energyScore: number;
  focusScore: number;
  mainWin: string;
  mainBlocker: string | null;
  mainBlockerOther: string | null;
  completedMainPriority: boolean;
  pendingForTomorrow: string;
  tomorrowMainPriority: string;
  // "Que horas você pretende dormir hoje?" (Sono, item 11) — "HH:mm" ou "".
  // Comparado amanhã contra o bed_time real do próximo sleep_log.
  plannedBedTime: string;
}

// Ligação com "Começar o dia" (opcional — relatórios de dias sem plano
// continuam funcionando exatamente como antes).
export interface DadosDoPlanoParaRelatorio {
  dailyPlanId: string | null;
  eightyTwentyCompletedCount: number | null;
  eightyTwentyTotalCount: number | null;
}

// "Garantir apenas um relatório principal por usuário/data" (item 5) — a
// tabela já tem UNIQUE(user_id, date); aqui só uma leitura direta antes de
// abrir o fluxo, pra decidir entre "Começar relatório" e "Você já encerrou
// seu dia hoje" (item 2).
export async function buscarRelatorioDoDia(userId: string, dataStr: string): Promise<RelatorioDiario | null> {
  const { data, error } = await supabase
    .from("daily_productivity_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("date", dataStr)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Upsert por (user_id, date) — cobre "Começar relatório" (não existe ainda)
// e "Atualizar relatório" (já existe, sobrescreve) com a mesma chamada.
export async function salvarRelatorio(
  userId: string,
  dataStr: string,
  respostas: RespostasQuestionario,
  metricas: MetricasAutomaticasDia,
  dadosDoPlano?: DadosDoPlanoParaRelatorio
): Promise<RelatorioDiario> {
  const { data, error } = await supabase
    .from("daily_productivity_reports")
    .upsert(
      {
        user_id: userId,
        date: dataStr,
        productivity_score: respostas.productivityScore,
        energy_score: respostas.energyScore,
        focus_score: respostas.focusScore,
        main_win: respostas.mainWin.trim() || null,
        main_blocker: respostas.mainBlocker,
        main_blocker_other: respostas.mainBlockerOther?.trim() || null,
        completed_main_priority: respostas.completedMainPriority,
        pending_for_tomorrow: respostas.pendingForTomorrow.trim() || null,
        tomorrow_main_priority: respostas.tomorrowMainPriority.trim() || null,
        planned_bed_time: respostas.plannedBedTime || null,
        daily_plan_id: dadosDoPlano?.dailyPlanId ?? null,
        eighty_twenty_completed_count: dadosDoPlano?.eightyTwentyCompletedCount ?? null,
        eighty_twenty_total_count: dadosDoPlano?.eightyTwentyTotalCount ?? null,
        focused_seconds: metricas.focusedSeconds,
        paused_seconds: metricas.pausedSeconds,
        distraction_seconds: metricas.distractionSeconds,
        possible_distraction_seconds: metricas.possibleDistractionSeconds,
        overtime_seconds: metricas.overtimeSeconds,
        longest_focus_seconds: metricas.longestFocusSeconds,
        completed_tasks: metricas.completedTasks,
        started_tasks: metricas.startedTasks,
        unfinished_tasks: metricas.unfinishedTasks,
        overdue_tasks: metricas.overdueTasks,
        focus_sessions_count: metricas.focusSessionsCount,
        pause_count: metricas.pauseCount,
        top_apps: metricas.topApps,
        top_projects: metricas.topProjects,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export type FiltroHistorico = "hoje" | "ontem" | "7dias" | "30dias";

// Histórico (item 11) — "Hoje"/"Ontem" são um dia exato; "7 dias"/"30 dias"
// incluem hoje mesmo (janela de N dias terminando hoje).
export async function buscarHistorico(userId: string, filtro: FiltroHistorico): Promise<RelatorioDiario[]> {
  const hoje = new Date();
  let query = supabase.from("daily_productivity_reports").select("*").eq("user_id", userId).order("date", { ascending: false });

  if (filtro === "hoje") {
    query = query.eq("date", format(hoje, "yyyy-MM-dd"));
  } else if (filtro === "ontem") {
    query = query.eq("date", format(subDays(hoje, 1), "yyyy-MM-dd"));
  } else {
    const dias = filtro === "7dias" ? 6 : 29;
    query = query.gte("date", format(subDays(hoje, dias), "yyyy-MM-dd"));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
