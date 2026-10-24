import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { useWorkspaceTabsOpcional } from "@/components/workspace/WorkspaceTabs";

// Excluir desenho (24/10, Davi: "hoje não dá para excluir desenhos"): pede confirmação, só preenche
// deleted_at (a linha fica no banco), fecha as guias do desenho (indo para a vizinha ou para o Painel) e
// mostra "Desenho excluído" com Desfazer, que limpa o deleted_at e reabre a guia se ela estava aberta.
// Usado na lateral (três pontinhos / clique direito) e no menu ☰ do próprio desenho.
export function useExcluirDesenho() {
  const abas = useWorkspaceTabsOpcional();
  const navigate = useNavigate();
  const location = useLocation();

  return async (id: string): Promise<boolean> => {
    if (!(await confirmar("Excluir este desenho?", { destrutivo: true, descricao: "Dá para desfazer logo em seguida." }))) return false;
    const { error } = await supabase.from("documentos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("Erro ao excluir desenho:", error);
      toast.error("Não consegui excluir o desenho");
      return false;
    }
    const caminho = `/desenho/${id}`;
    const guias = abas?.tabs.filter((t) => t.path === caminho) ?? [];
    const naTela = location.pathname === caminho;
    if (abas && guias.length) {
      // Mesma regra do X da guia: vai para a vizinha (que não seja deste desenho); sem vizinha, Painel.
      const i = abas.tabs.findIndex((t) => t.id === abas.activeId);
      const vizinha = [...abas.tabs.slice(0, i).reverse(), ...abas.tabs.slice(i + 1)].find((t) => t.path !== caminho);
      guias.forEach((t) => abas.closeTab(t.id));
      if (naTela) navigate(vizinha?.path ?? "/");
    } else if (naTela) {
      navigate("/");
    }
    window.dispatchEvent(new CustomEvent("documentos:mudou", { detail: { clienteId: null } }));
    toast.success("Desenho excluído", {
      duration: 6000,
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error: erro } = await supabase.from("documentos").update({ deleted_at: null }).eq("id", id);
          if (erro) { toast.error("Não consegui desfazer"); return; }
          window.dispatchEvent(new CustomEvent("documentos:mudou", { detail: { clienteId: null } }));
          if (guias.length && abas) abas.openTab(caminho, guias[0].title);
          toast.success("Desenho de volta");
        },
      },
    });
    return true;
  };
}
