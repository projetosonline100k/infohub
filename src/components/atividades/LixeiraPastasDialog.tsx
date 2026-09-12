import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const DIAS_ATE_APAGAR = 15;

interface PastaLixeira {
  id: string;
  nome: string;
  deleted_at: string;
  tarefas: number;
}

interface LixeiraPastasDialogProps {
  open: boolean;
  onClose: () => void;
  clienteId?: string;
  onRestaurar: () => void;
}

const diasRestantes = (deletedAt: string) => {
  const passados = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(DIAS_ATE_APAGAR - passados));
};

export const LixeiraPastasDialog = ({
  open,
  onClose,
  clienteId,
  onRestaurar,
}: LixeiraPastasDialogProps) => {
  const [pastas, setPastas] = useState<PastaLixeira[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    try {
      // Purga definitiva: pastas na lixeira há mais de 15 dias somem para sempre.
      const cortes = new Date(Date.now() - DIAS_ATE_APAGAR * 24 * 60 * 60 * 1000).toISOString();
      let expiradas = supabase
        .from("pastas_atividade")
        .delete()
        .lt("deleted_at", cortes);
      expiradas = clienteId ? expiradas.eq("cliente_id", clienteId) : expiradas.is("cliente_id", null);
      await expiradas;

      let query = supabase
        .from("pastas_atividade")
        .select("id, nome, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);
      const { data, error } = await query;
      if (error) throw error;

      const comContagem = await Promise.all(
        (data || []).map(async (p) => {
          const { count } = await supabase
            .from("atividades")
            .select("id", { count: "exact", head: true })
            .eq("pasta_id", p.id);
          return { ...p, tarefas: count || 0 };
        })
      );
      setPastas(comContagem);
    } catch (error) {
      console.error("Erro ao carregar lixeira:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) carregar();
  }, [open, clienteId]);

  const restaurar = async (pasta: PastaLixeira) => {
    try {
      const { error: erroPasta } = await supabase
        .from("pastas_atividade")
        .update({ deleted_at: null })
        .eq("id", pasta.id);
      if (erroPasta) throw erroPasta;

      const { error: erroAtividades } = await supabase
        .from("atividades")
        .update({ deleted_at: null })
        .eq("pasta_id", pasta.id);
      if (erroAtividades) throw erroAtividades;

      toast.success(`Pasta "${pasta.nome}" restaurada`);
      setPastas((prev) => prev.filter((p) => p.id !== pasta.id));
      onRestaurar();
    } catch (error) {
      console.error("Erro ao restaurar pasta:", error);
      toast.error("Erro ao restaurar pasta");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Lixeira
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Carregando...</p>
        ) : pastas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">A lixeira está vazia.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
            {pastas.map((pasta) => (
              <div
                key={pasta.id}
                className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/30 border border-border"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{pasta.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {pasta.tarefas} {pasta.tarefas === 1 ? "tarefa" : "tarefas"} · expira em{" "}
                    {diasRestantes(pasta.deleted_at)} {diasRestantes(pasta.deleted_at) === 1 ? "dia" : "dias"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => restaurar(pasta)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Restaurar
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
