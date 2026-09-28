import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PlanoDiario = Tables<"daily_plans">;

// Lista PRÓPRIA do plano matinal — diferente de OPCOES_BLOQUEIO (Encerrar o
// dia), troca "procrastinação" por "equipe" (pedido explícito, os dois
// questionários não compartilham esse enum).
export const OPCOES_BLOQUEIO_PLANO = [
  { valor: "celular", label: "Celular" },
  { valor: "redes_sociais", label: "Redes sociais" },
  { valor: "reunioes", label: "Reuniões" },
  { valor: "equipe", label: "Equipe" },
  { valor: "cansaco", label: "Cansaço" },
  { valor: "falta_clareza", label: "Falta de clareza" },
  { valor: "interrupcoes", label: "Interrupções" },
  { valor: "outro", label: "Outro" },
] as const;

export const LIMITE_ATIVIDADES_PLANO = 3;

export interface AtividadeDoPlano {
  id: string;
  titulo: string;
  concluida: boolean;
  clienteId: string | null;
  position: number;
  tempoEstimado: number | null;
}

export interface ProgressoDoPlano {
  plano: PlanoDiario;
  // Sempre busca por ID (nunca reaproveita a lista viva do Jarvis, que
  // remove uma tarefa assim que ela é concluída) — inclui concluídas, na
  // ordem escolhida no ritual matinal.
  atividades: AtividadeDoPlano[];
}

export interface SugestaoDeOntem {
  texto: string;
  tarefaExistenteId: string | null;
}

export async function buscarPlanoDoDia(userId: string, dataStr: string): Promise<PlanoDiario | null> {
  const { data, error } = await supabase
    .from("daily_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("date", dataStr)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function buscarProgressoDoDia(userId: string, dataStr: string): Promise<ProgressoDoPlano | null> {
  const plano = await buscarPlanoDoDia(userId, dataStr);
  if (!plano) return null;

  const { data: linhas, error } = await supabase
    .from("daily_plan_activities")
    .select("activity_id, position")
    .eq("daily_plan_id", plano.id)
    .order("position", { ascending: true });
  if (error) throw error;
  if (!linhas || linhas.length === 0) return { plano, atividades: [] };

  const ids = linhas.map((l) => l.activity_id);
  const { data: atividadesRows, error: errAtiv } = await supabase
    .from("atividades")
    .select("id, titulo, concluida, cliente_id, tempo_estimado")
    .in("id", ids);
  if (errAtiv) throw errAtiv;

  const porId = new Map((atividadesRows ?? []).map((a) => [a.id, a]));
  const atividades: AtividadeDoPlano[] = linhas
    .map((l) => {
      const a = porId.get(l.activity_id);
      if (!a) return null;
      return { id: a.id, titulo: a.titulo, concluida: a.concluida, clienteId: a.cliente_id, position: l.position, tempoEstimado: a.tempo_estimado };
    })
    .filter((a): a is AtividadeDoPlano => a !== null);

  return { plano, atividades };
}

export interface SalvarPlanoInput {
  mainPriorityActivityId: string | null;
  focusTimeAvailableMinutes: number | null;
  mandatoryOutcome: string;
  expectedBlocker: string | null;
  expectedBlockerOther: string | null;
  // Até 3, na ordem escolhida (posição 0 não é necessariamente a #1 — a
  // prioridade #1 é decidida à parte, ver mainPriorityActivityId).
  activityIds: string[];
}

// Upsert do plano + substitui as linhas de daily_plan_activities (delete +
// insert — o limite de 3 é pequeno o bastante pra não precisar de diff).
export async function salvarPlano(userId: string, dataStr: string, input: SalvarPlanoInput): Promise<PlanoDiario> {
  const { data: plano, error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: userId,
        date: dataStr,
        main_priority_activity_id: input.mainPriorityActivityId,
        focus_time_available_minutes: input.focusTimeAvailableMinutes,
        mandatory_outcome: input.mandatoryOutcome.trim() || null,
        expected_blocker: input.expectedBlocker,
        expected_blocker_other: input.expectedBlockerOther?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    )
    .select("*")
    .single();
  if (error || !plano) throw error || new Error("Falha ao salvar o plano do dia");

  const { error: delError } = await supabase.from("daily_plan_activities").delete().eq("daily_plan_id", plano.id);
  if (delError) throw delError;

  const linhas = input.activityIds.slice(0, LIMITE_ATIVIDADES_PLANO).map((activityId, index) => ({
    user_id: userId,
    daily_plan_id: plano.id,
    activity_id: activityId,
    position: index,
  }));
  if (linhas.length > 0) {
    const { error: insError } = await supabase.from("daily_plan_activities").insert(linhas);
    if (insError) throw insError;
  }

  return plano;
}

// Migrado de useMorningPriorityGreeting.ts (removido — a sugestão de ontem
// virou o primeiro passo deste fluxo, não uma saudação separada): "ontem
// você definiu como prioridade de amanhã: X" — sugere uma atividade aberta
// já existente com título igual (comparação simples, sem IA); nunca cria
// nada sozinho.
export async function buscarSugestaoDeOntem(userId: string, ontemStr: string): Promise<SugestaoDeOntem | null> {
  const { data: relatorioOntem, error } = await supabase
    .from("daily_productivity_reports")
    .select("tomorrow_main_priority")
    .eq("user_id", userId)
    .eq("date", ontemStr)
    .maybeSingle();
  if (error) return null;
  const texto = relatorioOntem?.tomorrow_main_priority?.trim();
  if (!texto) return null;

  const { data: abertas } = await supabase.from("atividades").select("id, titulo").eq("concluida", false).is("deleted_at", null);
  const correspondente = (abertas ?? []).find((a) => a.titulo.trim().toLowerCase() === texto.toLowerCase());

  return { texto, tarefaExistenteId: correspondente?.id ?? null };
}
