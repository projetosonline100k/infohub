import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriorityFlagProps {
  priority: string;
  onClick?: () => void;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  baixa: {
    label: "Baixa",
    color: "text-muted-foreground",
  },
  media: {
    label: "Média",
    color: "text-blue-400",
  },
  alta: {
    label: "Alta",
    color: "text-orange-400",
  },
  urgente: {
    label: "Urgente",
    color: "text-red-500",
  },
};

export const PriorityFlag = ({ priority, onClick, showLabel, size = "md" }: PriorityFlagProps) => {
  const config = priorityConfig[priority] || priorityConfig.media;
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 transition-colors hover:opacity-80",
        config.color
      )}
    >
      <Flag className={iconSize} fill="currentColor" />
      {showLabel && <span className="text-xs">{config.label}</span>}
    </button>
  );
};
