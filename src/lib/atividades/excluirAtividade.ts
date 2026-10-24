import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";

// Excluir tarefa (24/10, Davi): pede confirmação, só preenche deleted_at (a linha fica no banco)
// e mostra "Tarefa excluída" com Desfazer, que limpa o deleted_at. Usado em todas as listas de Atividades.
// Devolve true se excluiu; quem chama tira a tarefa da tela e, no Desfazer, recarrega.
export async function excluirAtividade(id: string, aoDesfazer: () => void): Promise<boolean> {
  if (!(await confirmar("Excluir esta tarefa?", { destrutivo: true, descricao: "Dá para desfazer logo em seguida." }))) return false;
  const { error } = await supabase.from("atividades").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("Erro ao excluir atividade:", error);
    toast.error("Não consegui excluir a tarefa");
    return false;
  }
  toast.success("Tarefa excluída", {
    duration: 6000,
    action: {
      label: "Desfazer",
      onClick: async () => {
        const { error: erro } = await supabase.from("atividades").update({ deleted_at: null }).eq("id", id);
        if (erro) { toast.error("Não consegui desfazer"); return; }
        toast.success("Tarefa de volta");
        aoDesfazer();
      },
    },
  });
  return true;
}
