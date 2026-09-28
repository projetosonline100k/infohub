import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buscarHabitos, buscarLogsDoIntervalo, type TipoRotina } from "./PerformanceHabitService";
import { calcularAutomaticoDoIntervalo, type AutomaticKey } from "./PerformanceAutomaticSources";
import { calcularProgressoDeMeta, type ProgressoMeta } from "./PerformanceMetricsService";

export type Meta = Tables<"performance_goals">;
export type TipoMeta = TipoRotina | "percentual";
export type PeriodoMeta = "semanal" | "mensal" | "personalizado";

export interface CriarMetaInput {
  nome: string;
  pillarId: string | null;
  tipo: TipoMeta;
  targetValue: number;
  unit?: string | null;
  period: PeriodoMeta;
  startDate: string;
  endDate: string;
  linkedHabitId?: string | null;
  automaticSource?: AutomaticKey | null;
}

export type AtualizarMetaInput = Partial<CriarMetaInput> & { ativo?: boolean };

export async function buscarMetas(userId: string): Promise<Meta[]> {
  const { data, error } = await supabase
    .from("performance_goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarMeta(userId: string, input: CriarMetaInput): Promise<Meta> {
  const { data, error } = await supabase
    .from("performance_goals")
    .insert({
      user_id: userId,
      nome: input.nome,
      pillar_id: input.pillarId,
      tipo: input.tipo,
      target_value: input.targetValue,
      unit: input.unit ?? null,
      period: input.period,
      start_date: input.startDate,
      end_date: input.endDate,
      linked_habit_id: input.linkedHabitId ?? null,
      automatic_source: input.automaticSource ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao criar meta");
  return data;
}

export async function atualizarMeta(id: string, patch: AtualizarMetaInput): Promise<Meta> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nome !== undefined) payload.nome = patch.nome;
  if (patch.pillarId !== undefined) payload.pillar_id = patch.pillarId;
  if (patch.tipo !== undefined) payload.tipo = patch.tipo;
  if (patch.targetValue !== undefined) payload.target_value = patch.targetValue;
  if (patch.unit !== undefined) payload.unit = patch.unit;
  if (patch.period !== undefined) payload.period = patch.period;
  if (patch.startDate !== undefined) payload.start_date = patch.startDate;
  if (patch.endDate !== undefined) payload.end_date = patch.endDate;
  if (patch.linkedHabitId !== undefined) payload.linked_habit_id = patch.linkedHabitId;
  if (patch.automaticSource !== undefined) payload.automatic_source = patch.automaticSource;
  if (patch.ativo !== undefined) payload.ativo = patch.ativo;

  const { data, error } = await supabase.from("performance_goals").update(payload).eq("id", id).select("*").single();
  if (error || !data) throw error || new Error("Falha ao atualizar meta");
  return data;
}

export async function excluirMeta(id: string): Promise<void> {
  const { error } = await supabase.from("performance_goals").delete().eq("id", id);
  if (error) throw error;
}

export interface DestaqueMeta {
  meta: Meta;
  progresso: ProgressoMeta;
  texto: string;
}

function formatarDestaque(meta: Meta, progresso: ProgressoMeta): string {
  if (meta.tipo === "percentual") return `${meta.nome}: ${Math.round(progresso.atual)}%.`;
  const unidade = meta.unit ? ` ${meta.unit}` : "";
  const faltam = Math.max(0, Math.round(progresso.alvo - progresso.atual));
  return `${meta.nome}: ${Math.round(progresso.atual)}/${Math.round(progresso.alvo)}${unidade}. Faltam ${faltam}.`;
}

// "Você está em 382/600 páginas este mês. Faltam 218." (item 20) — só a
// meta ativa mais relevante (a que está mais perto de bater, mas ainda não
// bateu), nunca todas de uma vez (evita virar spam no Jarvis).
export async function buscarDestaqueDeMeta(userId: string): Promise<DestaqueMeta | null> {
  const metas = (await buscarMetas(userId)).filter((m) => m.ativo && (m.automatic_source || m.linked_habit_id));
  if (metas.length === 0) return null;

  const precisaHabitos = metas.some((m) => m.linked_habit_id);
  const habitos = precisaHabitos ? await buscarHabitos(userId) : [];

  const candidatos: DestaqueMeta[] = [];
  for (const meta of metas) {
    let progresso: ProgressoMeta;
    if (meta.automatic_source) {
      const mapa = await calcularAutomaticoDoIntervalo(meta.automatic_source as AutomaticKey, userId, meta.start_date, meta.end_date);
      progresso = calcularProgressoDeMeta(meta, { automaticoIntervalo: mapa });
    } else {
      const habitoVinculado = habitos.find((h) => h.id === meta.linked_habit_id) ?? null;
      const logs = await buscarLogsDoIntervalo(userId, meta.start_date, meta.end_date);
      const logsDoHabito = logs.filter((l) => l.habit_id === meta.linked_habit_id);
      progresso = calcularProgressoDeMeta(meta, { habitoVinculado, logsDoHabito });
    }
    if (progresso.percentual > 0 && progresso.percentual < 100) {
      candidatos.push({ meta, progresso, texto: formatarDestaque(meta, progresso) });
    }
  }
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.progresso.percentual - a.progresso.percentual);
  return candidatos[0];
}
