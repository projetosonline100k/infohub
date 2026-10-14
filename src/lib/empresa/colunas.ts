import { supabase } from "@/integrations/supabase/client";

// Colunas do kanban do projeto: a primeira que não conclui (onde a tarefa
// nasce) e a que conclui.
export async function colunasDoProjeto(clienteId: string) {
  const { data } = await supabase.from("colunas_atividade").select("status_key, eh_conclusao, ordem")
    .eq("cliente_id", clienteId).order("ordem");
  const colunas = data || [];
  return {
    inicial: colunas.find((c) => !c.eh_conclusao)?.status_key ?? "backlog",
    conclusao: colunas.find((c) => c.eh_conclusao)?.status_key ?? "finalizado",
  };
}
