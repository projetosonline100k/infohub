import { cn } from "@/lib/utils";

interface StartDayPickPriorityOneProps {
  atividades: { id: string; titulo: string }[];
  valor: string | null;
  onEscolher: (id: string) => void;
}

// Pergunta 2 de 5: qual das até-3 atividades escolhidas é a prioridade #1 —
// pesa mais que o resto do 80/20 o dia inteiro (cobranças, "O que faço
// agora?", Home). Escolha do usuário, nunca sugerida por IA.
export function StartDayPickPriorityOne({ atividades, valor, onEscolher }: StartDayPickPriorityOneProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium leading-snug">Se você só pudesse concluir UMA hoje, qual seria?</h3>
      <div className="space-y-2">
        {atividades.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onEscolher(a.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
              valor === a.id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted"
            )}
          >
            <span aria-hidden="true">{valor === a.id ? "🔥" : "○"}</span>
            <span className="min-w-0 flex-1 truncate">{a.titulo}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
