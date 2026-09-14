import { useEffect, useState } from "react";
import { cn, iniciais, formatarTempo, rotuloDataRelativa } from "@/lib/utils";
import { FileText, Calendar, CheckSquare, Clock, Check } from "lucide-react";
import { PriorityFlag } from "./PriorityFlag";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

interface ChecklistResumo {
  total: number;
  concluidas: number;
}

interface KanbanCardProps {
  id: string;
  titulo: string;
  descricao?: string | null;
  concluida: boolean;
  prioridade: string;
  dataVencimento?: string | null;
  dataInicio?: string | null;
  tempoEstimado?: number | null;
  timerIniciadoEm?: string | null;
  timerDecorridoSegundos?: number;
  responsavelNome?: string | null;
  checklist?: ChecklistResumo;
  onClick: (id: string) => void;
  onToggleConcluida: (id: string, concluida: boolean) => void;
  onIniciarTimer: (id: string) => void;
  onPausarTimer: (id: string) => void;
  onZerarTimer: (id: string) => void;
  onTimerFinalizado: (id: string) => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  isDragging?: boolean;
}

// mm:ss (ou h:mm:ss se passar de 1h) pra acompanhar a contagem regressiva.
const formatarContagem = (segundos: number): string => {
  const seg = Math.max(0, Math.round(segundos));
  const horas = Math.floor(seg / 3600);
  const min = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (horas > 0) return `${horas}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
};

export const KanbanCard = ({
  id,
  titulo,
  descricao,
  concluida,
  prioridade,
  dataVencimento,
  dataInicio,
  tempoEstimado,
  timerIniciadoEm,
  timerDecorridoSegundos,
  responsavelNome,
  checklist,
  onClick,
  onToggleConcluida,
  onIniciarTimer,
  onPausarTimer,
  onZerarTimer,
  onTimerFinalizado,
  dragHandleProps,
  isDragging,
}: KanbanCardProps) => {
  const [menuTimerAberto, setMenuTimerAberto] = useState(false);

  const totalSeg = (tempoEstimado || 0) * 60;
  const decorridoBase = timerDecorridoSegundos || 0;
  const estaParado = !timerIniciadoEm && decorridoBase === 0;
  const estaPausado = !timerIniciadoEm && decorridoBase > 0;
  const estaAtivo = !!timerIniciadoEm || estaPausado;

  const calcularEstado = () => {
    const decorridoAgora = timerIniciadoEm ? (Date.now() - new Date(timerIniciadoEm).getTime()) / 1000 : 0;
    const decorridoTotal = decorridoBase + decorridoAgora;
    return {
      restante: totalSeg > 0 ? Math.max(0, totalSeg - decorridoTotal) : 0,
      progresso: totalSeg > 0 ? Math.min(100, (decorridoTotal / totalSeg) * 100) : 0,
    };
  };

  const [estado, setEstado] = useState(calcularEstado);

  // Preenche o bloco inteiro da esquerda pra direita, um passo por segundo
  // (funciona igual ao reabrir a página com o timer em andamento) e dispara
  // a pergunta de finalização assim que o tempo estimado se esgota.
  useEffect(() => {
    let disparado = false;
    const inicial = calcularEstado();
    setEstado(inicial);

    if (!timerIniciadoEm || totalSeg <= 0) return;
    if (inicial.restante <= 0) {
      onTimerFinalizado(id);
      return;
    }

    const interval = setInterval(() => {
      const atual = calcularEstado();
      setEstado(atual);
      if (atual.restante <= 0 && !disparado) {
        disparado = true;
        onTimerFinalizado(id);
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerIniciadoEm, decorridoBase, totalSeg, id, onTimerFinalizado]);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  // Comparação por string (yyyy-MM-dd) evita problema de fuso ao converter
  // pra Date; atividade concluída nunca conta como atrasada.
  const hoje = format(new Date(), "yyyy-MM-dd");
  const atrasada = !concluida && !!dataVencimento && dataVencimento < hoje;
  // Rótulo tipo "Amanhã"/"Em 3 dias" pra bater o olho sem fazer conta —
  // prioriza o vencimento, que é a data que realmente importa pro prazo.
  const rotuloRelativo = rotuloDataRelativa(dataVencimento || dataInicio || "");

  return (
    <div
      {...dragHandleProps}
      onClick={() => onClick(id)}
      className={cn(
        "group relative bg-card border border-border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 overflow-hidden",
        concluida && "opacity-60",
        isDragging && "shadow-lg ring-2 ring-primary/50",
        atrasada && "border-red-500/60 bg-red-500/5 hover:border-red-500"
      )}
    >
      {/* Preenchimento do timer: o bloco todo, da esquerda pra direita */}
      {estaAtivo && totalSeg > 0 && (
        <div
          className="absolute inset-y-0 left-0 z-0 bg-green-500/15 transition-[width] duration-1000 ease-linear"
          style={{ width: `${estado.progresso}%` }}
        />
      )}

      <div className="relative z-10">
        {/* Title + bolinha de concluir no hover */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleConcluida(id, !concluida);
            }}
            title={concluida ? "Reabrir tarefa" : "Marcar como concluída"}
            className={cn(
              "h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-opacity",
              concluida
                ? "opacity-100 bg-green-500 border-green-500"
                : "opacity-0 group-hover:opacity-100 border-muted-foreground hover:border-primary"
            )}
          >
            {concluida && <Check className="h-2.5 w-2.5 text-white" />}
          </button>
          <h4
            className={cn(
              "text-sm font-medium text-foreground line-clamp-2",
              concluida && "line-through text-muted-foreground"
            )}
          >
            {titulo}
          </h4>
        </div>

        {/* Info row - at the beginning as requested */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Avatar */}
          <Avatar className="h-5 w-5" title={responsavelNome || "Sem responsável"}>
            <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
              {responsavelNome ? iniciais(responsavelNome) : "?"}
            </AvatarFallback>
          </Avatar>

          {/* Dates */}
          {(dataInicio || dataVencimento) && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs",
                atrasada ? "text-red-500 font-medium" : "text-muted-foreground"
              )}
            >
              <Calendar className="h-3 w-3" />
              <span>
                {dataInicio && dataVencimento
                  ? `${formatDate(dataInicio)} → ${formatDate(dataVencimento)}`
                  : formatDate(dataInicio || dataVencimento!)}
                {rotuloRelativo && ` · ${rotuloRelativo}`}
              </span>
            </div>
          )}

          {/* Estimated time / timer */}
          {!!tempoEstimado && (
            <Popover open={menuTimerAberto} onOpenChange={setMenuTimerAberto}>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (estaParado) {
                      onIniciarTimer(id);
                      return;
                    }
                    setMenuTimerAberto(true);
                  }}
                  title={estaAtivo ? "Ver opções do timer" : "Clique para iniciar o timer"}
                  className={cn(
                    "flex items-center gap-1 text-xs transition-colors",
                    estaAtivo ? "text-green-500 font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Clock className={cn("h-3 w-3", !!timerIniciadoEm && "animate-pulse")} />
                  <span className="tabular-nums">
                    {estaAtivo ? formatarContagem(estado.restante) : formatarTempo(tempoEstimado)}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-36 p-1"
                onClick={(e) => e.stopPropagation()}
                align="start"
              >
                {estaPausado ? (
                  <button
                    onClick={() => {
                      onIniciarTimer(id);
                      setMenuTimerAberto(false);
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/50"
                  >
                    Retomar
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onPausarTimer(id);
                      setMenuTimerAberto(false);
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/50"
                  >
                    Pausar
                  </button>
                )}
                <button
                  onClick={() => {
                    onZerarTimer(id);
                    setMenuTimerAberto(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-destructive/10 text-destructive"
                >
                  Zerar
                </button>
              </PopoverContent>
            </Popover>
          )}

          {/* Checklist summary */}
          {checklist && checklist.total > 0 && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs text-muted-foreground",
                checklist.concluidas === checklist.total && "text-green-500"
              )}
            >
              <CheckSquare className="h-3 w-3" />
              <span>
                {checklist.concluidas}/{checklist.total}
              </span>
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
    </div>
  );
};
