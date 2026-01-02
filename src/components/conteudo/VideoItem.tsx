import { GripVertical, FileText, Sparkles, ArrowRightLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VideoStatusBadge } from "./VideoStatusBadge";
import { cn } from "@/lib/utils";

interface TagVideo {
  id: string;
  nome: string;
  cor: string;
}

interface VideoItemProps {
  id: string;
  titulo: string;
  descricao?: string | null;
  roteiro?: string | null;
  status: string;
  escalado?: boolean;
  tags?: TagVideo[];
  origemPlataforma?: string | null;
  onClick: () => void;
  onStatusChange?: (completed: boolean) => void;
  // Multi-select for batch roteiro creation
  selectedForRoteiro?: boolean;
  onRoteiroSelectChange?: (selected: boolean) => void;
  // Transfer between platforms
  onTransferPlatform?: () => void;
  plataformaDestino?: "youtube" | "vertical";
}

const TAG_COLORS: Record<string, string> = {
  blue: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  green: "bg-green-500/20 text-green-600 dark:text-green-400",
  red: "bg-red-500/20 text-red-600 dark:text-red-400",
  yellow: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  purple: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  pink: "bg-pink-500/20 text-pink-600 dark:text-pink-400",
  orange: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
  cyan: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
};

export const VideoItem = ({
  id,
  titulo,
  descricao,
  roteiro,
  status,
  escalado,
  tags = [],
  origemPlataforma,
  onClick,
  onStatusChange,
  selectedForRoteiro,
  onRoteiroSelectChange,
  onTransferPlatform,
  plataformaDestino,
}: VideoItemProps) => {
  const isCompleted = status === "pronto";
  const canSelectForRoteiro = status === "ideia" && !roteiro && onRoteiroSelectChange;

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors border-l-2",
        escalado 
          ? "border-l-primary bg-primary/5" 
          : "border-l-transparent",
        isCompleted && "opacity-60",
        selectedForRoteiro && "bg-primary/10 border-l-primary"
      )}
      onClick={onClick}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
      
      {canSelectForRoteiro ? (
        <Checkbox
          checked={selectedForRoteiro}
          onCheckedChange={(checked) => {
            onRoteiroSelectChange?.(!!checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4"
        />
      ) : (
        <Checkbox
          checked={isCompleted}
          onCheckedChange={(checked) => {
            onStatusChange?.(!!checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4"
        />
      )}

      <span className={cn(
        "flex-1 text-sm truncate",
        isCompleted && "line-through text-muted-foreground"
      )}>
        {titulo}
      </span>

      {origemPlataforma && (
        <Badge 
          variant="outline" 
          className={cn(
            "text-[10px] px-1.5 py-0 h-5",
            origemPlataforma === "youtube" 
              ? "border-red-500/50 text-red-500" 
              : "border-purple-500/50 text-purple-500"
          )}
        >
          {origemPlataforma === "youtube" ? "YouTube" : "Vertical"}
        </Badge>
      )}

      {roteiro && (
        <FileText className="h-4 w-4 text-muted-foreground" />
      )}

      {escalado && (
        <Sparkles className="h-4 w-4 text-primary" />
      )}

      {tags.slice(0, 2).map((tag) => (
        <span
          key={tag.id}
          className={cn(
            "px-1.5 py-0.5 rounded text-xs font-medium",
            TAG_COLORS[tag.cor] || TAG_COLORS.blue
          )}
        >
          {tag.nome}
        </span>
      ))}

      <VideoStatusBadge status={status} />

      {onTransferPlatform && (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onTransferPlatform();
          }}
          title={`Mover para ${plataformaDestino === "youtube" ? "YouTube" : "Vertical"}`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};
