import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Subtarefa {
  id: string;
  atividade_id: string;
  titulo: string;
  concluida: boolean;
  ordem: number;
}

interface SubtarefasListProps {
  atividadeId: string;
}

export const SubtarefasList = ({ atividadeId }: SubtarefasListProps) => {
  const [subtarefas, setSubtarefas] = useState<Subtarefa[]>([]);
  const [novaSubtarefa, setNovaSubtarefa] = useState("");
  const [loading, setLoading] = useState(true);

  const carregarSubtarefas = async () => {
    try {
      const { data, error } = await supabase
        .from("subtarefas_atividade")
        .select("*")
        .eq("atividade_id", atividadeId)
        .order("ordem", { ascending: true });

      if (error) throw error;
      setSubtarefas(data || []);
    } catch (error) {
      console.error("Erro ao carregar subtarefas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarSubtarefas();
  }, [atividadeId]);

  const adicionarSubtarefa = async () => {
    if (!novaSubtarefa.trim()) return;

    try {
      const { error } = await supabase.from("subtarefas_atividade").insert({
        atividade_id: atividadeId,
        titulo: novaSubtarefa,
        ordem: subtarefas.length + 1,
      });

      if (error) throw error;

      setNovaSubtarefa("");
      carregarSubtarefas();
    } catch (error) {
      console.error("Erro ao adicionar subtarefa:", error);
      toast.error("Erro ao adicionar subtarefa");
    }
  };

  const toggleSubtarefa = async (id: string, concluida: boolean) => {
    try {
      const { error } = await supabase
        .from("subtarefas_atividade")
        .update({ concluida })
        .eq("id", id);

      if (error) throw error;

      setSubtarefas((prev) =>
        prev.map((s) => (s.id === id ? { ...s, concluida } : s))
      );
    } catch (error) {
      console.error("Erro ao atualizar subtarefa:", error);
    }
  };

  const excluirSubtarefa = async (id: string) => {
    try {
      const { error } = await supabase
        .from("subtarefas_atividade")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setSubtarefas((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Erro ao excluir subtarefa:", error);
    }
  };

  const concluidas = subtarefas.filter((s) => s.concluida).length;
  const total = subtarefas.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Subtarefas</h4>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {concluidas}/{total}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {subtarefas.map((subtarefa) => (
          <div
            key={subtarefa.id}
            className="flex items-center gap-2 group py-1 px-2 hover:bg-muted/50 rounded"
          >
            <Checkbox
              checked={subtarefa.concluida}
              onCheckedChange={(checked) =>
                toggleSubtarefa(subtarefa.id, checked as boolean)
              }
              className="h-3.5 w-3.5"
            />
            <span
              className={cn(
                "flex-1 text-sm",
                subtarefa.concluida && "line-through text-muted-foreground"
              )}
            >
              {subtarefa.titulo}
            </span>
            <button
              onClick={() => excluirSubtarefa(subtarefa.id)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-opacity"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <Input
          value={novaSubtarefa}
          onChange={(e) => setNovaSubtarefa(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              adicionarSubtarefa();
            }
          }}
          placeholder="Adicionar subtarefa"
          className="h-8 text-sm bg-transparent border-none shadow-none focus-visible:ring-0 px-0"
        />
      </div>
    </div>
  );
};
