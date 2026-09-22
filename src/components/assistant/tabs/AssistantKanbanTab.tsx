import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { List, LayoutGrid, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { AssistantTarefa, ColunaAtividade, NovaAtividadeInput } from "@/hooks/useAssistantAtividades";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import { AssistantNovaAtividadeForm } from "./AssistantNovaAtividadeForm";

interface AssistantKanbanTabProps {
  projetoId: string | null;
  projetos: AssistantProjetoOpcao[];
  tarefas: AssistantTarefa[];
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onSelecionarTarefa: (id: string) => void;
  onConcluirDireto: (id: string) => void;
  onMoverStatus: (id: string, statusKey: string, ehConclusao: boolean) => void;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<unknown>;
}

type Modo = "lista" | "kanban";

// Aba "Kanban" — itens 4-5: mesmas atividades/colunas do Kanban principal
// (useAssistantAtividades), sem outro quadro/tabela paralela. Colunas
// empilhadas verticalmente (a largura do painel não comporta lado a lado) —
// arrastar entre elas muda status; é uma versão simplificada do
// handleDragEnd de AtividadesView.tsx (sempre vai pro fim da coluna de
// destino, sem recalcular a ordem fina dos outros cards).
export function AssistantKanbanTab({
  projetoId,
  projetos,
  tarefas,
  colunasDoProjeto,
  onSelecionarTarefa,
  onConcluirDireto,
  onMoverStatus,
  onCriarAtividade,
}: AssistantKanbanTabProps) {
  const [modo, setModo] = useState<Modo>("kanban");
  const [colunas, setColunas] = useState<ColunaAtividade[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);

  useEffect(() => {
    let cancelado = false;
    colunasDoProjeto(projetoId).then((cols) => {
      if (!cancelado) setColunas(cols);
    });
    return () => {
      cancelado = true;
    };
  }, [projetoId, colunasDoProjeto]);

  const tarefasDoProjeto = useMemo(
    () => tarefas.filter((t) => (t.cliente_id ?? null) === projetoId),
    [tarefas, projetoId],
  );

  const porColuna = useMemo(() => {
    const mapa: Record<string, AssistantTarefa[]> = {};
    colunas.forEach((c) => { mapa[c.status_key] = []; });
    tarefasDoProjeto.forEach((t) => {
      (mapa[t.status] ??= []).push(t);
    });
    Object.values(mapa).forEach((lista) => lista.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
    return mapa;
  }, [tarefasDoProjeto, colunas]);

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const colunaDestino = colunas.find((c) => c.status_key === destination.droppableId);
    if (!colunaDestino) return;
    onMoverStatus(draggableId, colunaDestino.status_key, colunaDestino.eh_conclusao);
  };

  if (mostrarForm) {
    return (
      <AssistantNovaAtividadeForm
        projetos={projetos}
        projetoIdPadrao={projetoId}
        colunasDoProjeto={colunasDoProjeto}
        onCriar={onCriarAtividade}
        onCancelar={() => setMostrarForm(false)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setModo("lista")}
            className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors", modo === "lista" ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            <List className="h-3.5 w-3.5" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setModo("kanban")}
            className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors", modo === "kanban" ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </button>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setMostrarForm(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova atividade
        </Button>
      </div>

      {tarefasDoProjeto.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma atividade pendente aqui ainda.</p>
      )}

      {modo === "lista" && tarefasDoProjeto.length > 0 && (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {tarefasDoProjeto.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <Checkbox checked={false} onCheckedChange={() => onConcluirDireto(t.id)} aria-label={`Concluir "${t.titulo}"`} />
              <button type="button" onClick={() => onSelecionarTarefa(t.id)} className="flex-1 truncate text-left text-sm hover:text-primary" title={t.titulo}>
                {t.titulo}
              </button>
            </li>
          ))}
        </ul>
      )}

      {modo === "kanban" && colunas.length > 0 && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-0.5">
            {colunas.map((coluna) => (
              <div key={coluna.status_key} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {coluna.nome} <span className="font-normal normal-case">({(porColuna[coluna.status_key] || []).length})</span>
                </p>
                <Droppable droppableId={coluna.status_key}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[8px] space-y-1 rounded-md">
                      {(porColuna[coluna.status_key] || []).map((tarefa, index) => (
                        <Draggable key={tarefa.id} draggableId={tarefa.id} index={index}>
                          {(providedDrag, snapshot) => (
                            <div
                              ref={providedDrag.innerRef}
                              {...providedDrag.draggableProps}
                              {...providedDrag.dragHandleProps}
                              onClick={() => onSelecionarTarefa(tarefa.id)}
                              className={cn(
                                "group flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-left text-xs shadow-sm transition-colors hover:border-primary/40",
                                snapshot.isDragging && "shadow-lg ring-1 ring-primary/40",
                              )}
                            >
                              <span className="flex-1 truncate">{tarefa.titulo}</span>
                              {coluna.eh_conclusao ? null : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onConcluirDireto(tarefa.id); }}
                                  title="Concluir"
                                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-emerald-500 group-hover:opacity-100"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
