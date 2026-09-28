import { eachDayOfInterval, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { TipoRotina } from "./PerformanceHabitService";

// Hábitos "automáticos" — nunca gravam em performance_habit_logs, sempre
// recalculados na hora a partir das tabelas que já existem (item 7 do
// pedido: "NÃO duplicar esses dados em logs manuais").
export type AutomaticKey =
  | "daily_plan_exists"
  | "daily_report_exists"
  | "priority_one_completed"
  | "focus_hours"
  | "tasks_completed";

export interface FonteAutomatica {
  key: AutomaticKey;
  label: string;
  tipo: TipoRotina;
}

export const CATALOGO_FONTES_AUTOMATICAS: FonteAutomatica[] = [
  { key: "daily_plan_exists", label: "Planejar o dia", tipo: "boolean" },
  { key: "daily_report_exists", label: "Encerrar o dia", tipo: "boolean" },
  { key: "priority_one_completed", label: "Prioridade #1", tipo: "boolean" },
  { key: "focus_hours", label: "Horas de foco", tipo: "horas" },
  { key: "tasks_completed", label: "Tarefas concluídas", tipo: "numero" },
];

export type StatusAutomatico = "concluida" | "nao_concluida" | "nao_aplicavel";

export interface ResultadoAutomatico {
  // Só preenchido pras 3 fontes boolean (daily_plan_exists,
  // daily_report_exists, priority_one_completed). "nao_aplicavel" (só
  // existe pra priority_one_completed) significa "não existia plano/
  // prioridade #1 nesse dia" — não conta a favor nem contra consistência,
  // mesmo tratamento de um dia não programado.
  statusBooleano: StatusAutomatico | null;
  // Só preenchido pras 2 fontes numéricas (focus_hours em horas,
  // tasks_completed em contagem). "Completo" pra essas é derivado por quem
  // consome (comparando com a meta_diaria do hábito), igual a um hábito
  // numérico manual.
  valueNumeric: number | null;
}

function diasDoIntervalo(inicioStr: string, fimStr: string): string[] {
  return eachDayOfInterval({ start: parseISO(inicioStr), end: parseISO(fimStr) }).map((d) => format(d, "yyyy-MM-dd"));
}

// Bucket por dia LOCAL (não UTC) — mesmo critério usado no resto do app pra
// "hoje" (format(new Date(), "yyyy-MM-dd")); `new Date(isoString)` já
// converte o timestamptz pro horário local antes do format.
function dataLocal(isoTimestamp: string): string {
  return format(new Date(isoTimestamp), "yyyy-MM-dd");
}

export async function calcularAutomaticoDoDia(key: AutomaticKey, userId: string, dateStr: string): Promise<ResultadoAutomatico> {
  const mapa = await calcularAutomaticoDoIntervalo(key, userId, dateStr, dateStr);
  return mapa.get(dateStr) ?? { statusBooleano: "nao_concluida", valueNumeric: 0 };
}

// Uma query por chave cobrindo o intervalo inteiro (nunca N queries) — usado
// tanto pelo dia único (acima) quanto pelas metas com automatic_source e
// pelo grid mensal.
export async function calcularAutomaticoDoIntervalo(
  key: AutomaticKey,
  userId: string,
  inicioStr: string,
  fimStr: string
): Promise<Map<string, ResultadoAutomatico>> {
  const dias = diasDoIntervalo(inicioStr, fimStr);
  const mapa = new Map<string, ResultadoAutomatico>();

  if (key === "daily_plan_exists" || key === "daily_report_exists") {
    const tabela = key === "daily_plan_exists" ? "daily_plans" : "daily_productivity_reports";
    const { data, error } = await supabase.from(tabela).select("date").eq("user_id", userId).gte("date", inicioStr).lte("date", fimStr);
    if (error) throw error;
    const existentes = new Set((data ?? []).map((r) => r.date));
    dias.forEach((d) => mapa.set(d, { statusBooleano: existentes.has(d) ? "concluida" : "nao_concluida", valueNumeric: null }));
    return mapa;
  }

  if (key === "priority_one_completed") {
    const { data: planos, error } = await supabase
      .from("daily_plans")
      .select("date, main_priority_activity_id")
      .eq("user_id", userId)
      .gte("date", inicioStr)
      .lte("date", fimStr);
    if (error) throw error;
    const porData = new Map((planos ?? []).map((p) => [p.date, p.main_priority_activity_id]));
    const ids = Array.from(new Set((planos ?? []).map((p) => p.main_priority_activity_id).filter((id): id is string => !!id)));
    const concluidaPorId = new Map<string, boolean>();
    if (ids.length > 0) {
      const { data: atividadesRows, error: errAtiv } = await supabase.from("atividades").select("id, concluida").in("id", ids);
      if (errAtiv) throw errAtiv;
      (atividadesRows ?? []).forEach((a) => concluidaPorId.set(a.id, a.concluida));
    }
    dias.forEach((d) => {
      const activityId = porData.get(d);
      if (!activityId) {
        mapa.set(d, { statusBooleano: "nao_aplicavel", valueNumeric: null });
        return;
      }
      const concluida = concluidaPorId.get(activityId) ?? false;
      mapa.set(d, { statusBooleano: concluida ? "concluida" : "nao_concluida", valueNumeric: null });
    });
    return mapa;
  }

  if (key === "focus_hours") {
    dias.forEach((d) => mapa.set(d, { statusBooleano: null, valueNumeric: 0 }));
    const inicioIso = `${inicioStr}T00:00:00`;
    const fimIso = `${fimStr}T23:59:59.999`;
    const { data, error } = await supabase
      .from("focus_sessions")
      .select("started_at, duration_seconds")
      .eq("user_id", userId)
      .gte("started_at", inicioIso)
      .lte("started_at", fimIso);
    if (error) throw error;
    (data ?? []).forEach((s) => {
      const d = dataLocal(s.started_at);
      const atual = mapa.get(d);
      if (atual) atual.valueNumeric = (atual.valueNumeric ?? 0) + (s.duration_seconds || 0) / 3600;
    });
    return mapa;
  }

  // tasks_completed
  dias.forEach((d) => mapa.set(d, { statusBooleano: null, valueNumeric: 0 }));
  const inicioIso = `${inicioStr}T00:00:00`;
  const fimIso = `${fimStr}T23:59:59.999`;
  const { data, error } = await supabase
    .from("atividades")
    .select("concluida_em")
    .is("deleted_at", null)
    .gte("concluida_em", inicioIso)
    .lte("concluida_em", fimIso);
  if (error) throw error;
  (data ?? []).forEach((a) => {
    if (!a.concluida_em) return;
    const d = dataLocal(a.concluida_em);
    const atual = mapa.get(d);
    if (atual) atual.valueNumeric = (atual.valueNumeric ?? 0) + 1;
  });
  return mapa;
}
