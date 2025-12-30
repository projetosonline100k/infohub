import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { CalendarDayCell } from "./CalendarDayCell";

interface Atividade {
  id: string;
  titulo: string;
  prioridade: string;
  data_atividade: string;
}

interface CalendarGridProps {
  currentDate: Date;
  atividades: Atividade[];
  onTaskClick: (id: string) => void;
  onAddTask: (date: Date) => void;
}

const WEEK_DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const CalendarGrid = ({
  currentDate,
  atividades,
  onTaskClick,
  onAddTask,
}: CalendarGridProps) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = new Date();

  const getAtividadesDoDia = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return atividades.filter((a) => a.data_atividade === dateStr);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Week days header */}
      <div className="grid grid-cols-7 bg-muted">
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-muted-foreground uppercase border-r border-b border-border last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <CalendarDayCell
            key={day.toISOString()}
            day={day.getDate()}
            date={day}
            isCurrentMonth={isSameMonth(day, currentDate)}
            isToday={isSameDay(day, today)}
            atividades={getAtividadesDoDia(day)}
            onTaskClick={onTaskClick}
            onAddTask={onAddTask}
          />
        ))}
      </div>
    </div>
  );
};
