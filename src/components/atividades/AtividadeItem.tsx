import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AtividadeItemProps {
  id: string;
  titulo: string;
  concluida: boolean;
  tempoEstimado?: number;
  temDescricao: boolean;
  destaque: boolean;
  onToggle: (id: string, concluida: boolean) => void;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
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
  onToggle,
  onClick,
  onDelete,
}: AtividadeItemProps) => {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer group transition-colors",
        destaque && "border-l-2 border-primary"
      )}
      onClick={() => onClick(id)}
    >
      <Checkbox
        checked={concluida}
        onCheckedChange={(checked) => {
          onToggle(id, checked as boolean);
        }}
        onClick={(e) => e.stopPropagation()}
        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />
      
      <span
        className={cn(
          "flex-1 text-sm text-foreground",
          concluida && "line-through text-muted-foreground"
        )}
      >
        {titulo}
      </span>
      
      {tempoEstimado && (
        <Badge variant="secondary" className="bg-primary/20 text-primary text-xs font-medium">
          {formatTempo(tempoEstimado)}
        </Badge>
      )}
      
      {temDescricao && (
        <FileText className="h-4 w-4 text-muted-foreground" />
      )}
      
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
