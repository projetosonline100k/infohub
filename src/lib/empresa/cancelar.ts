import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Cancelar uma entrega que não vai seguir (pedido do Davi, 15/10/2026).
// A tarefa ligada vai pra Lixeira (soft delete: dá pra recuperar); a edição /
// o carrossel ficam com status "cancelado" e o Danilo / Roy ignoram.
const db = supabase as unknown as SupabaseClient;
const paraLixeira = (ids: (string | null | undefined)[]) => {
  const validos = ids.filter((x): x is string => !!x);
  return validos.length ? db.from("atividades").update({ deleted_at: new Date().toISOString() }).in("id", validos) : Promise.resolve({ error: null });
};

export async function cancelarTarefa(id: string) {
  const { error } = await paraLixeira([id]);
  if (error) throw error;
}

export async function cancelarEdicao(id: string) {
  const { data } = await db.from("edicoes_video").select("atividade_id").eq("id", id).maybeSingle();
  const { error } = await db.from("edicoes_video").update({ status: "cancelado", mensagem: "Cancelado pelo Davi" }).eq("id", id);
  if (error) throw error;
  await paraLixeira([data?.atividade_id]);
}

export async function cancelarCarrossel(id: string) {
  const { data: c } = await db.from("carrosseis").select("atividade_id, tarefa_data_id, atividade_roy_id").eq("id", id).maybeSingle();
  const { error } = await db.from("carrosseis").update({ status: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  // A tarefa do Roy só sai se nenhum outro carrossel dela continua valendo.
  let roy: string | null = null;
  if (c?.atividade_roy_id) {
    const { data: irmaos } = await db.from("carrosseis").select("id").eq("atividade_roy_id", c.atividade_roy_id).neq("status", "cancelado");
    if (!irmaos?.length) roy = c.atividade_roy_id;
  }
  await paraLixeira([c?.atividade_id, c?.tarefa_data_id, roy]);
}

// "Escolher data" cancelada = o carrossel não vai ser publicado.
export async function cancelarPelaTarefaDeData(tarefaId: string) {
  const { data: c } = await db.from("carrosseis").select("id").eq("tarefa_data_id", tarefaId).maybeSingle();
  if (c?.id) await cancelarCarrossel(c.id);
  else await cancelarTarefa(tarefaId);
}
