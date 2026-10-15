import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { colunasDoProjeto } from "@/lib/empresa/colunas";

// Entrega em documento (Ítalo, Roy em página/quiz…): o Davi lê e aprova ou
// pede ajuste. O ajuste entra no combinado da tarefa e ela volta pra fila;
// o funcionário IA refaz sozinho (scripts/empresa/execucao.py) em cima do
// mesmo documento.
const db = supabase as unknown as SupabaseClient;   // quizzes ainda não está nos tipos gerados
export const MARCA_AJUSTE = "--- Ajuste pedido pelo Davi";

// Quiz (docs/QUIZ.md) tem duas aprovações: o esboço (volta pro Roy criar) e o
// quiz pronto (publica). Devolve a mensagem para o Davi.
export async function aprovarEntrega(tarefaId: string, clienteId: string): Promise<string> {
  const { data: quiz } = await db.from("quizzes").select("id, status").eq("atividade_id", tarefaId)
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (quiz?.status === "esboco") {
    const { error: e1 } = await db.from("quizzes").update({ status: "criando" }).eq("id", quiz.id);
    if (e1) throw e1;
    const { error } = await supabase.from("atividades").update({
      situacao: "fila", progresso: null, concluida: false, observacao: "Esboço aprovado pelo Davi: criando o quiz no Infopro.",
    }).eq("id", tarefaId);
    if (error) throw error;
    return "Esboço aprovado: o Roy começa a criar o quiz";
  }
  if (quiz?.status === "revisar") {
    const { error } = await db.from("quizzes").update({ status: "publicado" }).eq("id", quiz.id);
    if (error) throw error;
  }
  const { conclusao } = await colunasDoProjeto(clienteId);
  const { error } = await supabase.from("atividades").update({
    situacao: "concluida", concluida: true, progresso: 100, status: conclusao,
  }).eq("id", tarefaId);
  if (error) throw error;
  return quiz?.status === "revisar" ? "Quiz publicado: o link já está na aba Quiz" : "Aprovado: a tarefa foi concluída";
}

export async function pedirAjuste(tarefaId: string, pedido: string) {
  const { data, error: e1 } = await supabase.from("atividades").select("descricao").eq("id", tarefaId).maybeSingle();
  if (e1) throw e1;
  const descricao = `${(data?.descricao ?? "").trimEnd()}\n\n${MARCA_AJUSTE} (${format(new Date(), "dd/MM HH:mm")}):\n${pedido.trim()}`;
  const { error } = await supabase.from("atividades").update({
    descricao, situacao: "fila", progresso: null, concluida: false,
    observacao: `✏️ Ajuste pedido: ${pedido.trim().slice(0, 300)}`,
  }).eq("id", tarefaId);
  if (error) throw error;
}
