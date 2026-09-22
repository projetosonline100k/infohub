import { cn } from "@/lib/utils";

export type AssistantAba = "hoje" | "projeto" | "kanban" | "docs" | "notas";

const ABAS: { id: AssistantAba; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "projeto", label: "Projeto" },
  { id: "kanban", label: "Kanban" },
  { id: "docs", label: "Docs" },
  { id: "notas", label: "Notas" },
];

interface AssistantTopNavProps {
  aba: AssistantAba;
  onMudarAba: (aba: AssistantAba) => void;
}

// Navegação compacta do mini workspace — item 1 do pedido.
export function AssistantTopNav({ aba, onMudarAba }: AssistantTopNavProps) {
  return (
    <div className="scrollbar-thin flex items-center gap-0.5 overflow-x-auto border-b border-border px-2 py-1.5">
      {ABAS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onMudarAba(item.id)}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            aba === item.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
