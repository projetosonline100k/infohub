import { useState } from "react";
import { cn, formatarTempo } from "@/lib/utils";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { KanbanCard } from "./KanbanCard";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, X } from "lucide-react";

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  prioridade: string;
  data_vencimento: string | null;
  data_inicio: string | null;
  tempo_estimado: number | null;
  timer_iniciado_em: string | null;
  timer_decorrido_segundos: number;
  responsavel_nome: string | null;
  status: string;
}

interface ChecklistResumo {
  total: number;
  concluidas: number;
}

interface KanbanColumnProps {
  status: string;
  label: string;
  atividades: Atividade[];
  color: string;
  checklistPorAtividade?: Record<string, ChecklistResumo>;
  onCardClick: (id: string) => void;
  onAddCard: (status: string, titulo: string) => void;
  onRenameColuna: (status: string, novoNome: string) => void;
  onDeleteColuna: (status: string) => void;
  onToggleConcluida: (id: string, concluida: boolean) => void;
  onIniciarTimer: (id: string) => void;
  onPausarTimer: (id: string) => void;
  onZerarTimer: (id: string) => void;
  onTimerFinalizado: (id: string) => void;
}

export const KanbanColumn = ({
  status,
  label,
  atividades,
  color,
  checklistPorAtividade,
  onCardClick,
  onAddCard,
  onRenameColuna,
  onDeleteColuna,
  onToggleConcluida,
  onIniciarTimer,
  onPausarTimer,
  onZerarTimer,
  onTimerFinalizado,
}: KanbanColumnProps) => {
  const [adicionando, setAdicionando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEditado, setNomeEditado] = useState(label);

  const confirmarAdicao = () => {
    const valor = titulo.trim();
    if (valor) {
      onAddCard(status, valor);
    }
    setTitulo("");
    setAdicionando(false);
  };

  const iniciarEdicaoNome = () => {
    setNomeEditado(label);
    setEditandoNome(true);
  };

  const confirmarEdicaoNome = () => {
    const valor = nomeEditado.trim();
    if (valor && valor !== label) onRenameColuna(status, valor);
    setEditandoNome(false);
  };

  const tempoTotal = atividades.reduce((acc, a) => acc + (a.tempo_estimado || 0), 0);

  return (
    <div className="flex flex-col min-w-[280px] w-72 flex-shrink-0">
      {/* Header */}
      <div className={cn("group flex items-center gap-2 px-3 py-2 rounded-t-lg", color)}>
        {editandoNome ? (
          <Input
            autoFocus
            value={nomeEditado}
            onChange={(e) => setNomeEditado(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarEdicaoNome();
              else if (e.key === "Escape") setEditandoNome(false);
            }}
            onBlur={confirmarEdicaoNome}
            className="h-6 bg-white/20 border-none text-white text-xs font-semibold uppercase tracking-wide px-1.5 focus-visible:ring-1 focus-visible:ring-white"
          />
        ) : (
          <span
            onDoubleClick={iniciarEdicaoNome}
            className="text-xs font-semibold text-white uppercase tracking-wide flex-1 truncate cursor-text"
          >
            {label}
          </span>
        )}
        <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
          {atividades.length}
        </span>
        {tempoTotal > 0 && (
          <span className="text-white/80 text-[11px] font-medium flex-shrink-0">
            {formatarTempo(tempoTotal)}
          </span>
        )}
        {!editandoNome && (
          <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
            <button onClick={iniciarEdicaoNome} className="p-0.5 rounded hover:bg-white/20 text-white">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={() => onDeleteColuna(status)} className="p-0.5 rounded hover:bg-white/20 text-white">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Cards area */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex-1 bg-muted/30 rounded-b-lg p-2 space-y-2 min-h-[200px] transition-colors",
              snapshot.isDraggingOver && "bg-primary/10"
            )}
          >
            {atividades.map((atividade, index) => (
              <Draggable
                key={atividade.id}
                draggableId={atividade.id}
                index={index}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                  >
                    <KanbanCard
                      id={atividade.id}
                      titulo={atividade.titulo}
                      descricao={atividade.descricao}
                      concluida={atividade.concluida}
                      prioridade={atividade.prioridade}
                      dataVencimento={atividade.data_vencimento}
                      dataInicio={atividade.data_inicio}
                      tempoEstimado={atividade.tempo_estimado}
                      timerIniciadoEm={atividade.timer_iniciado_em}
                      timerDecorridoSegundos={atividade.timer_decorrido_segundos}
                      responsavelNome={atividade.responsavel_nome}
                      checklist={checklistPorAtividade?.[atividade.id]}
                      onClick={onCardClick}
                      onToggleConcluida={onToggleConcluida}
                      onIniciarTimer={onIniciarTimer}
                      onPausarTimer={onPausarTimer}
                      onZerarTimer={onZerarTimer}
                      onTimerFinalizado={onTimerFinalizado}
                      dragHandleProps={provided.dragHandleProps}
                      isDragging={snapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {/* Add card */}
            {adicionando ? (
              <Input
                autoFocus
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    confirmarAdicao();
                  } else if (e.key === "Escape") {
                    setTitulo("");
                    setAdicionando(false);
                  }
                }}
                onBlur={confirmarAdicao}
                placeholder="Nome da tarefa"
                className="h-8 bg-background"
              />
            ) : (
              <button
                onClick={() => setAdicionando(true)}
                className="w-full flex items-center gap-2 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm">Adicionar</span>
              </button>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
};
