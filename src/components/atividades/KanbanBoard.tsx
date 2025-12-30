import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./KanbanColumn";

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  concluida: boolean;
  prioridade: string;
  data_vencimento: string | null;
  status: string;
}

interface KanbanBoardProps {
  atividades: Atividade[];
  onDragEnd: (result: DropResult) => void;
  onCardClick: (id: string) => void;
}

const STATUS_CONFIG = [
  { status: "backlog", label: "Backlog", color: "bg-gray-500" },
  { status: "pendente", label: "Pendente", color: "bg-yellow-500" },
  { status: "em_progresso", label: "Em Execução", color: "bg-emerald-500" },
  { status: "revisao", label: "Revisão", color: "bg-orange-500" },
  { status: "finalizado", label: "Finalizado", color: "bg-green-600" },
];

export const KanbanBoard = ({
  atividades,
  onDragEnd,
  onCardClick,
}: KanbanBoardProps) => {
  const getAtividadesPorStatus = (status: string) => {
    return atividades.filter((a) => a.status === status);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {STATUS_CONFIG.map(({ status, label, color }) => (
          <KanbanColumn
            key={status}
            status={status}
            label={label}
            color={color}
            atividades={getAtividadesPorStatus(status)}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </DragDropContext>
  );
};
