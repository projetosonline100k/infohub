import { cn } from "@/lib/utils";

interface VideoStatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ideia: {
    label: "Ideia",
    className: "bg-muted text-muted-foreground",
  },
  roteiro: {
    label: "Roteiro",
    className: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  },
  gravacao: {
    label: "Gravação",
    className: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
  },
  edicao: {
    label: "Edição",
    className: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  },
  pronto: {
    label: "Pronto",
    className: "bg-green-500/20 text-green-600 dark:text-green-400",
  },
};

export const VideoStatusBadge = ({ status, className }: VideoStatusBadgeProps) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ideia;
  
  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-xs font-medium",
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
};
