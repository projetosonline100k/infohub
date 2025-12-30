import { cn } from "@/lib/utils";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { KanbanCard } from "./KanbanCard";
import { Plus } from "lucide-react";

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  prioridade: string;
  data_vencimento: string | null;
  status: string;
}

interface KanbanColumnProps {
  status: string;
  label: string;
  atividades: Atividade[];
  color: string;
  onCardClick: (id: string) => void;
}

export const KanbanColumn = ({
  status,
  label,
  atividades,
  color,
  onCardClick,
}: KanbanColumnProps) => {
  return (
    <div className="flex flex-col min-w-[280px] w-72 flex-shrink-0">
      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-lg", color)}>
        <span className="text-xs font-semibold text-white uppercase tracking-wide">
          {label}
        </span>
        <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
          {atividades.length}
        </span>
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
                      onClick={onCardClick}
                      dragHandleProps={provided.dragHandleProps}
                      isDragging={snapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {/* Add button */}
            <button className="w-full flex items-center gap-2 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors">
              <Plus className="h-4 w-4" />
              <span className="text-sm">Adicionar</span>
            </button>
          </div>
        )}
      </Droppable>
    </div>
  );
};
