import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePerformanceHabits } from "@/hooks/usePerformanceHabits";
import { PerformanceHabitForm } from "./PerformanceHabitForm";
import type { Habito, Pilar } from "@/lib/performance/PerformanceHabitService";

const ROTULO_FREQUENCIA = (h: Habito) =>
  h.source === "automatic" ? "Automática" : h.frequencia === "todos_os_dias" ? "Todos os dias" : "Dias específicos";

// Aba "Rotinas" — todos os hábitos (ativos e arquivados) agrupados por
// pilar, com criação/edição num Dialog. Arquivar nunca apaga (preserva o
// histórico de logs), só desativa (não aparece mais em "Hoje").
export function PerformanceHabitsManager() {
  const { habitos, pilares, criar, atualizar, arquivar, criarNovoPilar } = usePerformanceHabits();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Habito | null>(null);

  const abrirNovo = () => {
    setEditando(null);
    setDialogAberto(true);
  };
  const abrirEdicao = (h: Habito) => {
    setEditando(h);
    setDialogAberto(true);
  };

  const gruposComPilar = pilares.map((p) => ({ pilar: p as Pilar | null, itens: habitos.filter((h) => h.pillar_id === p.id) }));
  const semPilar = { pilar: null as Pilar | null, itens: habitos.filter((h) => !h.pillar_id) };
  const grupos = [...gruposComPilar, semPilar].filter((g) => g.itens.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" className="gap-1.5" onClick={abrirNovo}>
          <Plus className="h-3.5 w-3.5" />
          Nova rotina
        </Button>
      </div>

      {grupos.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma rotina ainda.</p>}

      {grupos.map(({ pilar, itens }) => (
        <div key={pilar?.id ?? "sem-pilar"} className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pilar?.nome ?? "Sem pilar"}</p>
          <Card className="divide-y divide-border">
            {itens.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className={cn("truncate text-sm", h.ativo ? "text-foreground" : "text-muted-foreground line-through")}>{h.nome}</p>
                  <p className="text-xs text-muted-foreground">{ROTULO_FREQUENCIA(h)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(h)} aria-label="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => arquivar(h.id, !h.ativo)}
                    aria-label={h.ativo ? "Arquivar" : "Reativar"}
                  >
                    {h.ativo ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      ))}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar rotina" : "Nova rotina"}</DialogTitle>
          </DialogHeader>
          <PerformanceHabitForm
            pilares={pilares}
            onCriarPilar={criarNovoPilar}
            habito={editando ?? undefined}
            onSalvar={(input) => (editando ? atualizar(editando.id, input) : criar(input))}
            onSalvo={() => setDialogAberto(false)}
            onCancelar={() => setDialogAberto(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
