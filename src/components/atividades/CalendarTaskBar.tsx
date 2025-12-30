import { cn } from "@/lib/utils";

interface CalendarTaskBarProps {
  id: string;
  titulo: string;
  prioridade: string;
  onClick: (id: string) => void;
}

const priorityColors: Record<string, string> = {
  urgente: "bg-red-500/80 hover:bg-red-500",
  alta: "bg-orange-500/80 hover:bg-orange-500",
  media: "bg-primary/80 hover:bg-primary",
  baixa: "bg-muted-foreground/50 hover:bg-muted-foreground/70",
};

export const CalendarTaskBar = ({
  id,
  titulo,
  prioridade,
  onClick,
}: CalendarTaskBarProps) => {
  const bgColor = priorityColors[prioridade] || priorityColors.media;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(id);
      }}
      className={cn(
        "w-full text-left px-1.5 py-0.5 rounded text-xs text-white font-medium truncate transition-colors",
        bgColor
      )}
    >
      {titulo}
    </button>
  );
};
