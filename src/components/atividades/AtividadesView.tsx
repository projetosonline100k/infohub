import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Bike, MoreHorizontal, ArrowUpDown, List, LayoutGrid, Calendar as CalendarIcon, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { DocumentEditor } from "@/components/documentos/DocumentEditor";
import { AtividadeItem } from "./AtividadeItem";
import { DiaSection } from "./DiaSection";
import { AtividadeDetailPanel } from "./AtividadeDetailPanel";
import { KanbanBoard } from "./KanbanBoard";
import { CalendarView } from "./CalendarView";
import { toast } from "sonner";
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  endOfYear, 
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addYears,
  subYears,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isSameDay,
  isWithinInterval,
  parseISO
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
type PeriodoFiltro = "semana" | "mes" | "ano";

interface GrupoAtividades {
  id: string;
  label: string;
  inicio: Date;
  fim: Date;
}

const getIntervaloData = (data: Date, periodo: PeriodoFiltro) => {
  if (periodo === "semana") {
    return {
      inicio: startOfWeek(data, { weekStartsOn: 1 }),
      fim: endOfWeek(data, { weekStartsOn: 1 }),
    };
  } else if (periodo === "mes") {
    return {
      inicio: startOfMonth(data),
      fim: endOfMonth(data),
    };
  } else {
    return {
      inicio: startOfYear(data),
      fim: endOfYear(data),
    };
  }
};

const getLabelPeriodo = (data: Date, periodo: PeriodoFiltro) => {
  if (periodo === "semana") {
    const inicio = startOfWeek(data, { weekStartsOn: 1 });
    const fim = endOfWeek(data, { weekStartsOn: 1 });
    return `${format(inicio, "d MMM", { locale: ptBR })} - ${format(fim, "d MMM", { locale: ptBR })}`;
  } else if (periodo === "mes") {
    return format(data, "MMMM yyyy", { locale: ptBR });
  } else {
    return format(data, "yyyy");
  }
};

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
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>("semana");
  const [dataReferencia, setDataReferencia] = useState(new Date());
  
  // Document editor state
  const [docEditorOpen, setDocEditorOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Get interval days based on period filter
  const intervaloDatas = useMemo(() => {
    return getIntervaloData(dataReferencia, periodoFiltro);
  }, [dataReferencia, periodoFiltro]);

  // Get groups for the current period based on filter type
  const gruposDoPeriodo = useMemo((): GrupoAtividades[] => {
    if (periodoFiltro === "semana") {
      // For week: show individual days
      const days = eachDayOfInterval({
        start: intervaloDatas.inicio,
        end: intervaloDatas.fim,
      });
      return days.map((day) => ({
        id: format(day, "yyyy-MM-dd"),
        label: `${format(day, "EEEE", { locale: ptBR }).charAt(0).toUpperCase() + format(day, "EEEE", { locale: ptBR }).slice(1)}, ${format(day, "d MMM", { locale: ptBR })}`,
        inicio: day,
        fim: day,
      }));
    } else if (periodoFiltro === "mes") {
      // For month: show weeks
      const weeks = eachWeekOfInterval(
        { start: intervaloDatas.inicio, end: intervaloDatas.fim },
        { weekStartsOn: 1 }
      );
      return weeks.map((weekStart, index) => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        return {
          id: `semana-${index + 1}`,
          label: `Semana ${index + 1} (${format(weekStart, "d MMM", { locale: ptBR })} - ${format(weekEnd, "d MMM", { locale: ptBR })})`,
          inicio: weekStart,
          fim: weekEnd,
        };
      });
    } else {
      // For year: show months
      const months = eachMonthOfInterval({
        start: intervaloDatas.inicio,
        end: intervaloDatas.fim,
      });
      return months.map((monthStart) => {
        const monthEnd = endOfMonth(monthStart);
        return {
          id: format(monthStart, "yyyy-MM"),
          label: format(monthStart, "MMMM", { locale: ptBR }).charAt(0).toUpperCase() + format(monthStart, "MMMM", { locale: ptBR }).slice(1),
          inicio: monthStart,
          fim: monthEnd,
        };
      });
    }
  }, [intervaloDatas, periodoFiltro]);

  const labelPeriodo = useMemo(() => {
    return getLabelPeriodo(dataReferencia, periodoFiltro);
  }, [dataReferencia, periodoFiltro]);

  const periodoAnterior = () => {
    if (periodoFiltro === "semana") {
      setDataReferencia((prev) => subWeeks(prev, 1));
    } else if (periodoFiltro === "mes") {
      setDataReferencia((prev) => subMonths(prev, 1));
    } else {
      setDataReferencia((prev) => subYears(prev, 1));
    }
  };

  const proximoPeriodo = () => {
    if (periodoFiltro === "semana") {
      setDataReferencia((prev) => addWeeks(prev, 1));
    } else if (periodoFiltro === "mes") {
      setDataReferencia((prev) => addMonths(prev, 1));
    } else {
      setDataReferencia((prev) => addYears(prev, 1));
    }
  };

  const irParaHoje = () => {
    setDataReferencia(new Date());
  };

  const carregarAtividades = async () => {
    try {
      const inicioStr = format(intervaloDatas.inicio, "yyyy-MM-dd");
      const fimStr = format(intervaloDatas.fim, "yyyy-MM-dd");

      let query = supabase
        .from("atividades")
        .select("*")
        .gte("data_atividade", inicioStr)
        .lte("data_atividade", fimStr)
        .order("data_atividade", { ascending: true })
        .order("ordem", { ascending: true });

      if (clienteId) {
        query = query.eq("cliente_id", clienteId);
      } else {
        query = query.is("cliente_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAtividades(data || []);

      // Open groups that have tasks
      const gruposComTarefas: Record<string, boolean> = {};
      (data || []).forEach((atividade) => {
        const dataAtv = parseISO(atividade.data_atividade);
        const grupoEncontrado = gruposDoPeriodo.find((g) => 
          isWithinInterval(dataAtv, { start: g.inicio, end: g.fim })
        );
        if (grupoEncontrado) {
          gruposComTarefas[grupoEncontrado.id] = true;
        }
      });
      setDiasAbertos(gruposComTarefas);
    } catch (error) {
      console.error("Erro ao carregar atividades:", error);
      toast.error("Erro ao carregar atividades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAtividades();
  }, [clienteId, intervaloDatas]);

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

  const getAtividadesDoGrupo = (grupo: GrupoAtividades) => {
    return atividades
      .filter((a) => {
        const dataAtv = parseISO(a.data_atividade);
        return isWithinInterval(dataAtv, { start: grupo.inicio, end: grupo.fim });
      })
      .sort((a, b) => {
        // Sort by date first, then by order
        if (a.data_atividade !== b.data_atividade) {
          return a.data_atividade.localeCompare(b.data_atividade);
        }
        return a.ordem - b.ordem;
      });
  };

  const toggleDia = (dataKey: string) => {
    setDiasAbertos((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey],
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

  const criarNovoDocumento = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        cliente_id: clienteId || null,
        titulo: "Documento sem título",
      })
      .select()
      .single();

    if (data && !error) {
      setSelectedDocId(data.id);
      setDocEditorOpen(true);
    } else {
      toast.error("Erro ao criar documento");
    }
  };

  const handleCloseDocEditor = () => {
    setDocEditorOpen(false);
    setSelectedDocId(null);
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
          <Button
            variant="ghost"
            size="sm"
            onClick={criarNovoDocumento}
            className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <FileText className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Novo Doc</span>
          </Button>
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

      {/* Period Filter - Only in list mode */}
      {viewMode === "lista" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={periodoAnterior}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select
              value={periodoFiltro}
              onValueChange={(value: PeriodoFiltro) => setPeriodoFiltro(value)}
            >
              <SelectTrigger className="w-[130px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Esta Semana</SelectItem>
                <SelectItem value="mes">Este Mês</SelectItem>
                <SelectItem value="ano">Este Ano</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={proximoPeriodo}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={irParaHoje}
          >
            Hoje
          </Button>
          <span className="text-sm text-muted-foreground capitalize">
            {labelPeriodo}
          </span>
        </div>
      )}

      {/* View Content */}
      {viewMode === "lista" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-1">
            {gruposDoPeriodo.map((grupo) => {
              const atividadesDoGrupo = getAtividadesDoGrupo(grupo);
              const contagem = atividadesDoGrupo.length;
              const isToday = periodoFiltro === "semana" && isSameDay(grupo.inicio, new Date());

              return (
                <DiaSection
                  key={grupo.id}
                  dia={grupo.label}
                  contagem={contagem}
                  isOpen={diasAbertos[grupo.id] || false}
                  onToggle={() => toggleDia(grupo.id)}
                  isToday={isToday}
                >
                  <Droppable droppableId={grupo.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[2px] rounded transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/10" : ""
                        }`}
                      >
                        {atividadesDoGrupo.map((atividade, index) => (
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

      {/* Document Editor */}
      {docEditorOpen && selectedDocId && (
        <DocumentEditor documentoId={selectedDocId} onClose={handleCloseDocEditor} />
      )}
    </div>
  );
};
