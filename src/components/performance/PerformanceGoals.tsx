import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePerformanceGoals } from "@/hooks/usePerformanceGoals";
import { usePerformanceHabits } from "@/hooks/usePerformanceHabits";
import { PerformanceGoalCard } from "./PerformanceGoalCard";
import { PerformanceGoalForm } from "./PerformanceGoalForm";
import type { Meta } from "@/lib/performance/PerformanceGoalService";

// Aba "Metas" — cards com barra de progresso (item 8/9 do pedido).
export function PerformanceGoals() {
  const { metas, progressos, loading, criar, atualizar, excluir } = usePerformanceGoals();
  const { pilares, habitos } = usePerformanceHabits();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Meta | null>(null);

  const abrirNova = () => {
    setEditando(null);
    setDialogAberto(true);
  };
  const abrirEdicao = (m: Meta) => {
    setEditando(m);
    setDialogAberto(true);
  };

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Carregando metas...</p>;
  }

  const ativas = metas.filter((m) => m.ativo);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" className="gap-1.5" onClick={abrirNova}>
          <Plus className="h-3.5 w-3.5" />
          Nova meta
        </Button>
      </div>

      {ativas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma meta ativa ainda.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ativas.map((m) => (
            <PerformanceGoalCard
              key={m.id}
              meta={m}
              progresso={progressos.get(m.id) ?? { atual: 0, alvo: m.target_value, percentual: 0 }}
              onEditar={() => abrirEdicao(m)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar meta" : "Nova meta"}</DialogTitle>
          </DialogHeader>
          <PerformanceGoalForm
            pilares={pilares}
            habitos={habitos}
            meta={editando ?? undefined}
            onSalvar={(input) => (editando ? atualizar(editando.id, input) : criar(input))}
            onSalvo={() => setDialogAberto(false)}
            onCancelar={() => setDialogAberto(false)}
            onExcluir={
              editando
                ? async () => {
                    await excluir(editando.id);
                    setDialogAberto(false);
                  }
                : undefined
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
