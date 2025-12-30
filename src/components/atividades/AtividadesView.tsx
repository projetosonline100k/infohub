import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Bike, MoreHorizontal, ArrowUpDown, GripVertical, List, LayoutGrid, Calendar as CalendarIcon } from "lucide-react";
import { AtividadeItem } from "./AtividadeItem";
import { DiaSection } from "./DiaSection";
import { AtividadeDetailPanel } from "./AtividadeDetailPanel";
import { KanbanBoard } from "./KanbanBoard";
import { CalendarView } from "./CalendarView";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";

interface Atividade {
  id: string;
  cliente_id: string | null;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  tempo_estimado: number | null;
  data_atividade: string;
  ordem: number;
  destaque: boolean;
  created_at: string;
  status: string;
  prioridade: string;
  data_vencimento: string | null;
  data_inicio: string | null;
}

interface AtividadesViewProps {
  clienteId?: string;
}

type ViewMode = "lista" | "quadro" | "calendario";

const DIAS_SEMANA = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

// Parse tempo from text like "1h", "40min", "30m"
const parseTempoFromText = (text: string): { titulo: string; tempo: number | null } => {
  const tempoRegex = /(\d+)\s*(h|hora|hr|min|m|minutos?)\b/gi;
  let totalMinutos = 0;
  let titulo = text;
  let match;

  while ((match = tempoRegex.exec(text)) !== null) {
    const valor = parseInt(match[1]);
    const unidade = match[2].toLowerCase();

    if (unidade.startsWith("h")) {
      totalMinutos += valor * 60;
    } else {
      totalMinutos += valor;
    }

    titulo = titulo.replace(match[0], "").trim();
  }

  return {
    titulo: titulo || text,
    tempo: totalMinutos > 0 ? totalMinutos : null,
  };
};

export const AtividadesView = ({ clienteId }: AtividadesViewProps) => {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaAtividade, setNovaAtividade] = useState("");
  const [diasAbertos, setDiasAbertos] = useState<Record<string, boolean>>({});
  const [selectedAtividade, setSelectedAtividade] = useState<Atividade | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("lista");

  // Get current week's days
  const getWeekDays = useCallback(() => {
    const hoje = new Date();
    const inicioSemana = startOfWeek(hoje, { weekStartsOn: 1 }); // Monday start
    return DIAS_SEMANA.map((dia, index) => ({
      nome: dia,
      data: format(addDays(inicioSemana, index), "yyyy-MM-dd"),
    }));
  }, []);

  const weekDays = getWeekDays();

  const carregarAtividades = async () => {
    try {
      let query = supabase
        .from("atividades")
        .select("*")
        .order("ordem", { ascending: true });

      if (clienteId) {
        query = query.eq("cliente_id", clienteId);
      } else {
        query = query.is("cliente_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAtividades(data || []);

      // Open days that have tasks
      const diasComTarefas: Record<string, boolean> = {};
      (data || []).forEach((atividade) => {
        const diaIndex = weekDays.findIndex((d) => d.data === atividade.data_atividade);
        if (diaIndex !== -1) {
          diasComTarefas[weekDays[diaIndex].nome] = true;
        }
      });
      setDiasAbertos(diasComTarefas);
    } catch (error) {
      console.error("Erro ao carregar atividades:", error);
      toast.error("Erro ao carregar atividades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAtividades();
  }, [clienteId]);

  const adicionarAtividade = async (dataOverride?: Date) => {
    if (!novaAtividade.trim()) return;

    const { titulo, tempo } = parseTempoFromText(novaAtividade);
    const dataAtividade = dataOverride 
      ? format(dataOverride, "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd");

    try {
      const { error } = await supabase.from("atividades").insert({
        titulo,
        tempo_estimado: tempo,
        data_atividade: dataAtividade,
        cliente_id: clienteId || null,
        ordem: atividades.length + 1,
      });

      if (error) throw error;

      setNovaAtividade("");
      carregarAtividades();
      toast.success("Atividade adicionada");
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast.error("Erro ao adicionar atividade");
    }
  };

  const adicionarAtividadeRapida = async (date: Date) => {
    const titulo = prompt("Nome da tarefa:");
    if (!titulo?.trim()) return;

    try {
      const { error } = await supabase.from("atividades").insert({
        titulo,
        data_atividade: format(date, "yyyy-MM-dd"),
        cliente_id: clienteId || null,
        ordem: atividades.length + 1,
      });

      if (error) throw error;
      carregarAtividades();
      toast.success("Atividade adicionada");
    } catch (error) {
      console.error("Erro ao adicionar atividade:", error);
      toast.error("Erro ao adicionar atividade");
    }
  };

  const toggleAtividade = async (id: string, concluida: boolean) => {
    try {
      const novoStatus = concluida ? "finalizado" : "pendente";
      const { error } = await supabase
        .from("atividades")
        .update({ concluida, status: novoStatus })
        .eq("id", id);

      if (error) throw error;

      setAtividades((prev) =>
        prev.map((a) => (a.id === id ? { ...a, concluida, status: novoStatus } : a))
      );
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast.error("Erro ao atualizar atividade");
    }
  };

  const excluirAtividade = async (id: string) => {
    try {
      const { error } = await supabase.from("atividades").delete().eq("id", id);

      if (error) throw error;

      setAtividades((prev) => prev.filter((a) => a.id !== id));
      toast.success("Atividade excluída");
    } catch (error) {
      console.error("Erro ao excluir atividade:", error);
      toast.error("Erro ao excluir atividade");
    }
  };

  const getAtividadesDoDia = (dataStr: string) => {
    return atividades
      .filter((a) => a.data_atividade === dataStr)
      .sort((a, b) => a.ordem - b.ordem);
  };

  const toggleDia = (dia: string) => {
    setDiasAbertos((prev) => ({
      ...prev,
      [dia]: !prev[dia],
    }));
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;

    // Same position
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceData = source.droppableId;
    const destData = destination.droppableId;

    // Find the activity
    const atividade = atividades.find((a) => a.id === draggableId);
    if (!atividade) return;

    // Check if dragging between status columns (Kanban mode)
    const statusOptions = ["backlog", "pendente", "em_progresso", "revisao", "finalizado"];
    const isKanbanDrag = statusOptions.includes(sourceData) || statusOptions.includes(destData);

    if (isKanbanDrag) {
      // Update status
      const updatedAtividade = {
        ...atividade,
        status: destData,
        concluida: destData === "finalizado",
      };

      setAtividades((prev) =>
        prev.map((a) => (a.id === draggableId ? updatedAtividade : a))
      );

      try {
        const { error } = await supabase
          .from("atividades")
          .update({
            status: destData,
            concluida: destData === "finalizado",
          })
          .eq("id", draggableId);

        if (error) throw error;
      } catch (error) {
        console.error("Erro ao mover atividade:", error);
        toast.error("Erro ao mover atividade");
        carregarAtividades();
      }
      return;
    }

    // List mode drag - between days
    const sourceAtividades = getAtividadesDoDia(sourceData);
    const destAtividades =
      sourceData === destData
        ? sourceAtividades
        : getAtividadesDoDia(destData);

    // Remove from source
    const [removed] = sourceAtividades.splice(source.index, 1);

    // Add to destination
    if (sourceData === destData) {
      sourceAtividades.splice(destination.index, 0, removed);
    } else {
      destAtividades.splice(destination.index, 0, removed);
    }

    // Update local state immediately for optimistic UI
    const updatedAtividade = {
      ...removed,
      data_atividade: destData,
      ordem: destination.index + 1,
    };

    setAtividades((prev) =>
      prev.map((a) => (a.id === draggableId ? updatedAtividade : a))
    );

    // Update in database
    try {
      const { error } = await supabase
        .from("atividades")
        .update({
          data_atividade: destData,
          ordem: destination.index + 1,
        })
        .eq("id", draggableId);

      if (error) throw error;

      // Update ordem for other activities in destination
      const atividadesParaAtualizar =
        sourceData === destData ? sourceAtividades : destAtividades;

      for (let i = 0; i < atividadesParaAtualizar.length; i++) {
        if (atividadesParaAtualizar[i].id !== draggableId) {
          await supabase
            .from("atividades")
            .update({ ordem: i + 1 })
            .eq("id", atividadesParaAtualizar[i].id);
        }
      }
    } catch (error) {
      console.error("Erro ao mover atividade:", error);
      toast.error("Erro ao mover atividade");
      carregarAtividades(); // Revert on error
    }
  };

  const openAtividadeDetail = (id: string) => {
    const atv = atividades.find((a) => a.id === id);
    if (atv) {
      setSelectedAtividade(atv);
      setPanelOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Carregando atividades...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bike className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">
            Atividades
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("lista")}
              className={cn(
                "h-7 px-2.5 rounded-md",
                viewMode === "lista" && "bg-background shadow-sm"
              )}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("quadro")}
              className={cn(
                "h-7 px-2.5 rounded-md",
                viewMode === "quadro" && "bg-background shadow-sm"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("calendario")}
              className={cn(
                "h-7 px-2.5 rounded-md",
                viewMode === "calendario" && "bg-background shadow-sm"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </div>
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Add task input */}
      <div className="relative">
        <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={novaAtividade}
          onChange={(e) => setNovaAtividade(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              adicionarAtividade();
            }
          }}
          placeholder="Adicionar tarefa (ex: Criar conteúdo 2h)"
          className="pl-9 bg-muted/50 border-muted"
        />
      </div>

      {/* View Content */}
      {viewMode === "lista" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-1">
            {weekDays.map(({ nome, data }) => {
              const atividadesDoDia = getAtividadesDoDia(data);
              const contagem = atividadesDoDia.length;

              return (
                <DiaSection
                  key={nome}
                  dia={nome}
                  contagem={contagem}
                  isOpen={diasAbertos[nome] || false}
                  onToggle={() => toggleDia(nome)}
                >
                  <Droppable droppableId={data}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[2px] rounded transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/10" : ""
                        }`}
                      >
                        {atividadesDoDia.map((atividade, index) => (
                          <Draggable
                            key={atividade.id}
                            draggableId={atividade.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`${
                                  snapshot.isDragging ? "opacity-90 shadow-lg" : ""
                                }`}
                              >
                                <AtividadeItem
                                  id={atividade.id}
                                  titulo={atividade.titulo}
                                  concluida={atividade.concluida}
                                  tempoEstimado={atividade.tempo_estimado || undefined}
                                  temDescricao={!!atividade.descricao}
                                  destaque={atividade.destaque}
                                  status={atividade.status}
                                  prioridade={atividade.prioridade}
                                  dataVencimento={atividade.data_vencimento}
                                  onToggle={toggleAtividade}
                                  onClick={openAtividadeDetail}
                                  onDelete={excluirAtividade}
                                  dragHandleProps={provided.dragHandleProps}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DiaSection>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {viewMode === "quadro" && (
        <KanbanBoard
          atividades={atividades}
          onDragEnd={handleDragEnd}
          onCardClick={openAtividadeDetail}
        />
      )}

      {viewMode === "calendario" && (
        <CalendarView
          atividades={atividades}
          onTaskClick={openAtividadeDetail}
          onAddTask={adicionarAtividadeRapida}
        />
      )}

      {/* Detail Panel */}
      <AtividadeDetailPanel
        open={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setSelectedAtividade(null);
        }}
        atividade={selectedAtividade}
        onUpdate={carregarAtividades}
        onDelete={excluirAtividade}
      />
    </div>
  );
};
