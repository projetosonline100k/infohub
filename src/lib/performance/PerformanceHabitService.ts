import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AutomaticKey } from "./PerformanceAutomaticSources";

export type Pilar = Tables<"performance_pillars">;
export type Habito = Tables<"performance_habits">;
export type HabitoLog = Tables<"performance_habit_logs">;

export type TipoRotina = "boolean" | "numero" | "minutos" | "horas" | "paginas";
export type FrequenciaHabito = "todos_os_dias" | "dias_especificos";
export type SourceHabito = "manual" | "automatic";

export const NOMES_PILARES_PADRAO = ["Corpo", "Mente", "Trabalho", "Vida pessoal"];

export async function buscarPilares(userId: string): Promise<Pilar[]> {
  const { data, error } = await supabase
    .from("performance_pillars")
    .select("*")
    .eq("user_id", userId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function criarPilar(userId: string, nome: string, ordem = 0): Promise<Pilar> {
  const { data, error } = await supabase
    .from("performance_pillars")
    .insert({ user_id: userId, nome, ordem })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao criar pilar");
  return data;
}

export async function atualizarPilar(id: string, patch: { nome?: string; ordem?: number }): Promise<Pilar> {
  const { data, error } = await supabase
    .from("performance_pillars")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao atualizar pilar");
  return data;
}

export async function excluirPilar(id: string): Promise<void> {
  const { error } = await supabase.from("performance_pillars").delete().eq("id", id);
  if (error) throw error;
}

// Só é chamado a partir de uma ação explícita da pessoa (onboarding "Criar
// minha primeira rotina" ou "+ novo pilar" no formulário de hábito quando a
// lista ainda está vazia) — nunca automaticamente ao abrir a página (item
// 25 do pedido: "NÃO criar automaticamente no banco sem confirmação").
export async function garantirPilaresPadrao(userId: string): Promise<Pilar[]> {
  const existentes = await buscarPilares(userId);
  if (existentes.length > 0) return existentes;
  const { data, error } = await supabase
    .from("performance_pillars")
    .insert(NOMES_PILARES_PADRAO.map((nome, ordem) => ({ user_id: userId, nome, ordem })))
    .select("*");
  if (error) throw error;
  return (data ?? []).sort((a, b) => a.ordem - b.ordem);
}

export interface CriarHabitoInput {
  pillarId: string | null;
  nome: string;
  descricao?: string | null;
  tipo: TipoRotina;
  metaDiaria?: number | null;
  unidade?: string | null;
  frequencia: FrequenciaHabito;
  diasDaSemana?: number[] | null;
  source: SourceHabito;
  automaticKey?: AutomaticKey | null;
  ordem?: number;
}

export type AtualizarHabitoInput = Partial<CriarHabitoInput> & { ativo?: boolean };

export async function buscarHabitos(userId: string): Promise<Habito[]> {
  const { data, error } = await supabase
    .from("performance_habits")
    .select("*")
    .eq("user_id", userId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function criarHabito(userId: string, input: CriarHabitoInput): Promise<Habito> {
  const { data, error } = await supabase
    .from("performance_habits")
    .insert({
      user_id: userId,
      pillar_id: input.pillarId,
      nome: input.nome,
      descricao: input.descricao ?? null,
      tipo: input.tipo,
      meta_diaria: input.metaDiaria ?? null,
      unidade: input.unidade ?? null,
      frequencia: input.frequencia,
      dias_da_semana: input.frequencia === "dias_especificos" ? input.diasDaSemana ?? [] : null,
      source: input.source,
      automatic_key: input.source === "automatic" ? input.automaticKey ?? null : null,
      ordem: input.ordem ?? 0,
    })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao criar hábito");
  return data;
}

export async function atualizarHabito(id: string, patch: AtualizarHabitoInput): Promise<Habito> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.pillarId !== undefined) payload.pillar_id = patch.pillarId;
  if (patch.nome !== undefined) payload.nome = patch.nome;
  if (patch.descricao !== undefined) payload.descricao = patch.descricao;
  if (patch.tipo !== undefined) payload.tipo = patch.tipo;
  if (patch.metaDiaria !== undefined) payload.meta_diaria = patch.metaDiaria;
  if (patch.unidade !== undefined) payload.unidade = patch.unidade;
  if (patch.frequencia !== undefined) payload.frequencia = patch.frequencia;
  if (patch.diasDaSemana !== undefined) payload.dias_da_semana = patch.diasDaSemana;
  if (patch.source !== undefined) payload.source = patch.source;
  if (patch.automaticKey !== undefined) payload.automatic_key = patch.automaticKey;
  if (patch.ordem !== undefined) payload.ordem = patch.ordem;
  if (patch.ativo !== undefined) payload.ativo = patch.ativo;

  const { data, error } = await supabase.from("performance_habits").update(payload).eq("id", id).select("*").single();
  if (error || !data) throw error || new Error("Falha ao atualizar hábito");
  return data;
}

// Nunca exclui de verdade (perderia o histórico de logs) — só desativa.
export async function arquivarHabito(id: string, ativo: boolean): Promise<Habito> {
  return atualizarHabito(id, { ativo });
}

export async function buscarLogsDoDia(userId: string, date: string): Promise<HabitoLog[]> {
  const { data, error } = await supabase
    .from("performance_habit_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date);
  if (error) throw error;
  return data ?? [];
}

export async function buscarLogsDoIntervalo(userId: string, inicioStr: string, fimStr: string): Promise<HabitoLog[]> {
  const { data, error } = await supabase
    .from("performance_habit_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("date", inicioStr)
    .lte("date", fimStr);
  if (error) throw error;
  return data ?? [];
}

export interface SalvarLogInput {
  valueNumeric?: number | null;
  completed?: boolean | null;
  notes?: string | null;
}

export async function salvarLog(userId: string, habitId: string, date: string, input: SalvarLogInput): Promise<HabitoLog> {
  const { data, error } = await supabase
    .from("performance_habit_logs")
    .upsert(
      {
        user_id: userId,
        habit_id: habitId,
        date,
        value_numeric: input.valueNumeric ?? null,
        completed: input.completed ?? null,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,habit_id,date" }
    )
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Falha ao registrar hábito");
  return data;
}
