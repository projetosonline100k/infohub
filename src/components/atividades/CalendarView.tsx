import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarGrid } from "./CalendarGrid";

interface Atividade {
  id: string;
  titulo: string;
  prioridade: string;
  data_atividade: string;
}

interface CalendarViewProps {
  atividades: Atividade[];
  onTaskClick: (id: string) => void;
  onAddTask: (date: Date) => void;
}

export const CalendarView = ({
  atividades,
  onTaskClick,
  onAddTask,
}: CalendarViewProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const goToPreviousMonth = () => {
    setCurrentDate((prev) => subMonths(prev, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate((prev) => addMonths(prev, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthYearLabel = format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground capitalize">
          {monthYearLabel}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousMonth}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextMonth}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => onAddTask(currentDate)}
            className="ml-2"
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <CalendarGrid
        currentDate={currentDate}
        atividades={atividades}
        onTaskClick={onTaskClick}
        onAddTask={onAddTask}
      />
    </div>
  );
};
