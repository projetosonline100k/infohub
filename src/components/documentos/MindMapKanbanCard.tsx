import { CSSProperties } from "react";
import { MoreHorizontal, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ResponsavelAvatares } from "@/components/atividades/ResponsavelAvatares";
import { PriorityFlag } from "@/components/atividades/PriorityFlag";
import { StatusBadge } from "@/components/atividades/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tables } from "@/integrations/supabase/types";

export type MindMapKanbanAtividade = Tables<"atividades">;

interface MindMapKanbanCardProps {
  box: { left: number; top: number; width: number; height: number; zoom: number };
  selected?: boolean;
  atividade: MindMapKanbanAtividade | null | undefined;
  statusLabel?: string;
  onToggleConcluida: () => void;
  onAbrirDetalhes: () => void;
  onRemoverDoMapa: () => void;
}

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), "d MMM", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

// Sobreposto ao retângulo invisível do Excalidraw que representa o card
// (ver customData.kanban em MindMapEditor.tsx). O container inteiro é
// pointer-events-none pra clique/arraste no corpo do card caírem direto no
// canvas por baixo (seleciona/move/redimensiona o retângulo normalmente,
// igual qualquer bloco do mapa) — só o checkbox e o menu "..." recebem
// pointer-events-auto, mesmo truque dos pontinhos de conexão.
export function MindMapKanbanCard({ box, selected, atividade, statusLabel, onToggleConcluida, onAbrirDetalhes, onRemoverDoMapa }: MindMapKanbanCardProps) {
  // Tamanho fixo nas unidades "de cena" (não muda com o zoom) + um
  // transform escalando o card inteiro como um adesivo rígido — evita
  // reflow de fontes/ícones internos ao dar zoom no canvas (que acontecia
  // quando width/height eram recalculados já multiplicados pelo zoom).
  const style: CSSProperties = {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    transform: `scale(${box.zoom})`,
    transformOrigin: "top left",
  };

  if (atividade === undefined) {
    return (
      <div className="pointer-events-none absolute z-10 animate-pulse rounded-lg border border-border bg-card/60" style={style} />
    );
  }

  if (atividade === null) {
    return (
      <div className="pointer-events-none absolute z-10 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-destructive/50 bg-card/80 p-2 text-center" style={style}>
        <p className="text-xs text-muted-foreground">Atividade não encontrada</p>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onRemoverDoMapa}
          className="pointer-events-auto flex items-center gap-1 text-xs text-destructive hover:underline"
        >
          <X className="h-3 w-3" /> Remover do mapa
        </button>
      </div>
    );
  }

  const {
    titulo,
    concluida,
    prioridade,
    data_inicio: dataInicio,
    data_vencimento: dataVencimento,
    responsavel_nome: responsavelNome,
  } = atividade;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 flex flex-col gap-1.5 overflow-hidden rounded-lg border border-border bg-card p-2.5 shadow-sm",
        concluida && "opacity-60",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      style={style}
    >
      <div className="flex items-start justify-between gap-1">
        {statusLabel && (
          <span className="pointer-events-none">
            <StatusBadge status={atividade.status} label={statusLabel} />
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              className="pointer-events-auto ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              title="Mais opções"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onMouseDown={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onAbrirDetalhes}>Abrir detalhes</DropdownMenuItem>
            <DropdownMenuItem onClick={onRemoverDoMapa} className="text-destructive focus:text-destructive">
              Remover do mapa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-start gap-2">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onToggleConcluida}
          title={concluida ? "Reabrir tarefa" : "Marcar como concluída"}
          className={cn(
            "pointer-events-auto mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
            concluida ? "border-green-500 bg-green-500" : "border-muted-foreground hover:border-primary"
          )}
        >
          {concluida && <Check className="h-2.5 w-2.5 text-white" />}
        </button>
        <h4 className={cn("line-clamp-2 text-sm font-medium text-foreground", concluida && "text-muted-foreground line-through")}>
          {titulo}
        </h4>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <span className="pointer-events-none">
          <ResponsavelAvatares responsavelNome={responsavelNome} fallbackTextClassName="text-[9px]" size="h-5 w-5" />
        </span>
        {(dataInicio || dataVencimento) && (
          <span className="text-xs text-muted-foreground">
            {dataInicio && dataVencimento
              ? `${formatDate(dataInicio)} → ${formatDate(dataVencimento)}`
              : formatDate(dataInicio || dataVencimento!)}
          </span>
        )}
        <span className="pointer-events-none ml-auto">
          <PriorityFlag priority={prioridade} size="sm" />
        </span>
      </div>
    </div>
  );
}
