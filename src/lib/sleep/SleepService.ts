import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type SleepLog = Tables<"sleep_logs">;
export type SleepGoal = Tables<"sleep_goals">;
export type WakeFeeling = "muito_cansado" | "cansado" | "normal" | "bem" | "muito_disposto";

export const OPCOES_WAKE_FEELING: { valor: WakeFeeling; label: string }[] = [
  { valor: "muito_cansado", label: "Muito cansado" },
  { valor: "cansado", label: "Cansado" },
  { valor: "normal", label: "Normal" },
  { valor: "bem", label: "Bem" },
  { valor: "muito_disposto", label: "Muito disposto" },
];

// "23:40 → 07:10" = 7h30. Se acordar <= dormir, atravessou meia-noite —
// soma 24h antes de subtrair (item de teste 2 do pedido).
export function calcularDuracaoMinutos(bedTime: string, wakeTime: string): number {
  const [bh, bm] = bedTime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  const bedMinutos = bh * 60 + bm;
  let wakeMinutos = wh * 60 + wm;
  if (wakeMinutos <= bedMinutos) wakeMinutos += 24 * 60;
  return wakeMinutos - bedMinutos;
}

// "7h30" / "7h" quando a duração é redonda — usado tanto pra exibir a
// duração dormida quanto (em SleepMetricsService) pra exibir uma variação
// em minutos como duração.
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export async function buscarLogDoDia(userId: string, date: string): Promise<SleepLog | null> {
  const { data, error } = await supabase.from("sleep_logs").select("*").eq("user_id", userId).eq("sleep_date", date).maybeSingle();
  if (error) throw error;
  return data;
}

export async function buscarLogsDoIntervalo(userId: string, inicioStr: string, fimStr: string): Promise<SleepLog[]> {
  const { data, error } = await supabase
    .from("sleep_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("sleep_date", inicioStr)
    .lte("sleep_date", fimStr)
    .order("sleep_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface SalvarSleepLogInput {
  bedTime: string;
  wakeTime: string;
  qualityScore: number;
  nightAwakenings?: number | null;
  wakeFeeling?: WakeFeeling | null;
  notes?: string | null;
}

// Upsert por (user_id, sleep_date) — item de teste 4 (nunca cria dois logs
// pro mesmo dia). total_sleep_minutes SEMPRE calculado aqui, nunca confia
// num valor vindo do cliente.
export async function salvarLog(userId: string, date: string, input: SalvarSleepLogInput): Promise<SleepLog> {
  const totalSleepMinutes = calcularDuracaoMinutos(input.bedTime, input.wakeTime);
  const { data, error } = await supabase
    .from("sleep_logs")
    .upsert(
      {
        user_id: userId,
        sleep_date: date,
        bed_time: input.bedTime,
        wake_time: input.wakeTime,
        total_sleep_minutes: totalSleepMinutes,
        quality_score: input.qualityScore,
        night_awakenings: input.nightAwakenings ?? null,
        wake_feeling: input.wakeFeeling ?? null,
        notes: input.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,sleep_date" }
    )
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao salvar o registro de sono");
  return data;
}

export async function buscarMeta(userId: string): Promise<SleepGoal | null> {
  const { data, error } = await supabase.from("sleep_goals").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface SalvarSleepGoalInput {
  targetSleepMinutes: number;
  idealBedTime?: string | null;
  idealWakeTime?: string | null;
}

export async function salvarMeta(userId: string, input: SalvarSleepGoalInput): Promise<SleepGoal> {
  const { data, error } = await supabase
    .from("sleep_goals")
    .upsert(
      {
        user_id: userId,
        target_sleep_minutes: input.targetSleepMinutes,
        ideal_bed_time: input.idealBedTime ?? null,
        ideal_wake_time: input.idealWakeTime ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao salvar a meta de sono");
  return data;
}
