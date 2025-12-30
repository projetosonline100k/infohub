import { cn } from "@/lib/utils";
import { FileText, Calendar, Link2 } from "lucide-react";
import { PriorityFlag } from "./PriorityFlag";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

interface KanbanCardProps {
  id: string;
  titulo: string;
  descricao?: string | null;
  concluida: boolean;
  prioridade: string;
  dataVencimento?: string | null;
  onClick: (id: string) => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  isDragging?: boolean;
}

export const KanbanCard = ({
  id,
  titulo,
  descricao,
  concluida,
  prioridade,
  dataVencimento,
  onClick,
  dragHandleProps,
  isDragging,
}: KanbanCardProps) => {
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      {...dragHandleProps}
      onClick={() => onClick(id)}
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/30",
        concluida && "opacity-60",
        isDragging && "shadow-lg ring-2 ring-primary/50"
      )}
    >
      {/* Title */}
      <h4
        className={cn(
          "text-sm font-medium text-foreground mb-2 line-clamp-2",
          concluida && "line-through text-muted-foreground"
        )}
      >
        {titulo}
      </h4>

      {/* Info row - at the beginning as requested */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Avatar */}
        <Avatar className="h-5 w-5">
          <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
            ?
          </AvatarFallback>
        </Avatar>

        {/* Due date */}
        {dataVencimento && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(dataVencimento)}</span>
          </div>
        )}

        {/* Priority */}
        <PriorityFlag priority={prioridade} size="sm" />

        {/* Description indicator */}
        {descricao && (
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
    </div>
  );
};
