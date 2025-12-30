import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  onClick?: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pendente: {
    label: "Pendente",
    className: "bg-muted text-muted-foreground",
  },
  em_progresso: {
    label: "Em Progresso",
    className: "bg-blue-500/20 text-blue-400",
  },
  finalizado: {
    label: "Finalizado",
    className: "bg-green-500/20 text-green-400",
  },
};

export const StatusBadge = ({ status, onClick }: StatusBadgeProps) => {
  const config = statusConfig[status] || statusConfig.pendente;

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80",
        config.className
      )}
    >
      {config.label}
    </button>
  );
};
