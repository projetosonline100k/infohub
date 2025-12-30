import { cn } from "@/lib/utils";
import { CalendarTaskBar } from "./CalendarTaskBar";
import { Plus } from "lucide-react";

interface Atividade {
  id: string;
  titulo: string;
  prioridade: string;
}

interface CalendarDayCellProps {
  day: number;
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  atividades: Atividade[];
  onTaskClick: (id: string) => void;
  onAddTask: (date: Date) => void;
}

export const CalendarDayCell = ({
  day,
  date,
  isCurrentMonth,
  isToday,
  atividades,
  onTaskClick,
  onAddTask,
}: CalendarDayCellProps) => {
  const maxVisible = 3;
  const visibleTasks = atividades.slice(0, maxVisible);
  const hiddenCount = atividades.length - maxVisible;

  return (
    <div
      className={cn(
        "min-h-[100px] border-r border-b border-border p-1 transition-colors group",
        !isCurrentMonth && "bg-muted/30",
        isToday && "bg-primary/5"
      )}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full",
            isToday && "bg-primary text-primary-foreground",
            !isCurrentMonth && "text-muted-foreground"
          )}
        >
          {day}
        </span>
        <button
          onClick={() => onAddTask(date)}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-opacity"
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* Tasks */}
      <div className="space-y-1">
        {visibleTasks.map((atividade) => (
          <CalendarTaskBar
            key={atividade.id}
            id={atividade.id}
            titulo={atividade.titulo}
            prioridade={atividade.prioridade}
            onClick={onTaskClick}
          />
        ))}
        {hiddenCount > 0 && (
          <span className="text-xs text-muted-foreground px-1">
            +{hiddenCount} mais
          </span>
        )}
      </div>
    </div>
  );
};
