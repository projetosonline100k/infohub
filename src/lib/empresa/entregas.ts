import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { colunasDoProjeto } from "@/lib/empresa/colunas";

// Entrega em documento (Ítalo, Roy em página/quiz…): o Davi lê e aprova ou
// pede ajuste. O ajuste entra no combinado da tarefa e ela volta pra fila;
// o funcionário IA refaz sozinho (scripts/empresa/execucao.py) em cima do
// mesmo documento.
export const MARCA_AJUSTE = "--- Ajuste pedido pelo Davi";

export async function aprovarEntrega(tarefaId: string, clienteId: string) {
  const { conclusao } = await colunasDoProjeto(clienteId);
  const { error } = await supabase.from("atividades").update({
    situacao: "concluida", concluida: true, progresso: 100, status: conclusao,
  }).eq("id", tarefaId);
  if (error) throw error;
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
