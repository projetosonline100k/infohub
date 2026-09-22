import { cn } from "@/lib/utils";

interface AssistantBubbleProps {
  message: string;
  tone?: "info" | "success";
}

// Balão curto que aparece perto da orbe por alguns segundos — usado tanto
// pelas cobranças (useAssistantCobranca) quanto pela celebração ao concluir
// uma tarefa. Quem chama controla quanto tempo fica visível (timeout lá em
// Assistant.tsx); aqui só cuida da entrada suave.
export function AssistantBubble({ message, tone = "info" }: AssistantBubbleProps) {
  return (
    <div
      role="status"
      className={cn(
        "absolute bottom-full right-0 z-40 mb-3 w-max max-w-[220px] animate-in fade-in-0 slide-in-from-bottom-1 zoom-in-95",
        "rounded-xl border px-3 py-2 text-sm shadow-lg",
        tone === "success"
          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
          : "border-border bg-popover text-popover-foreground",
      )}
    >
      {message}
    </div>
  );
}
