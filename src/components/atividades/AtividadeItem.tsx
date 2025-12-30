import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, GripVertical, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { PriorityFlag } from "./PriorityFlag";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

interface AtividadeItemProps {
  id: string;
  titulo: string;
  concluida: boolean;
  tempoEstimado?: number;
  temDescricao: boolean;
  destaque: boolean;
  status: string;
  prioridade: string;
  dataVencimento?: string | null;
  onToggle: (id: string, concluida: boolean) => void;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

const formatTempo = (minutos: number): string => {
  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return mins > 0 ? `${horas}h${mins}min` : `${horas}h`;
  }
  return `${minutos}min`;
};

export const AtividadeItem = ({
  id,
  titulo,
  concluida,
  tempoEstimado,
  temDescricao,
  destaque,
  status,
  prioridade,
  dataVencimento,
  onToggle,
  onClick,
  onDelete,
  dragHandleProps,
}: AtividadeItemProps) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted/50 cursor-pointer group transition-colors border-b border-border/50",
        destaque && "border-l-2 border-l-primary"
      )}
      onClick={() => onClick(id)}
    >
      {/* Drag Handle */}
      <div
        {...dragHandleProps}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <Checkbox
        checked={concluida}
        onCheckedChange={(checked) => {
          onToggle(id, checked as boolean);
        }}
        onClick={(e) => e.stopPropagation()}
        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />

      {/* Title */}
      <span
        className={cn(
          "flex-1 text-sm text-foreground truncate",
          concluida && "line-through text-muted-foreground"
        )}
      >
        {titulo}
      </span>

      {/* Description icon */}
      {temDescricao && (
        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      )}

      {/* Status Badge */}
      <StatusBadge status={status} />

      {/* Due Date */}
      {dataVencimento && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{format(parseISO(dataVencimento), "dd/MM", { locale: ptBR })}</span>
        </div>
      )}

      {/* Time Estimate */}
      {tempoEstimado && (
        <Badge variant="secondary" className="bg-primary/20 text-primary text-xs font-medium">
          {formatTempo(tempoEstimado)}
        </Badge>
      )}

      {/* Priority */}
      <PriorityFlag priority={prioridade} />

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/20 rounded"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </button>
    </div>
  );
};
