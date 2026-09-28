import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";

const TODOS = "__todos__";

interface ProjetoSelectorInlineProps {
  projetos: AssistantProjetoOpcao[];
  projetoId: string | null;
  onSelecionar: (id: string | null) => void;
}

// Seletor de projeto embutido nas abas Kanban/Notas — substitui a antiga
// aba "Projeto" isolada. Mesmo `projetoId` global (useAssistantProjeto),
// só que agora trocado direto de onde ele é usado, sem precisar navegar
// pra outra aba só pra isso.
export function ProjetoSelectorInline({ projetos, projetoId, onSelecionar }: ProjetoSelectorInlineProps) {
  return (
    <Select value={projetoId ?? TODOS} onValueChange={(v) => onSelecionar(v === TODOS ? null : v)}>
      <SelectTrigger className="h-7 w-auto max-w-full gap-1 border-none bg-transparent px-0 text-xs font-medium text-muted-foreground shadow-none hover:text-foreground focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos os projetos</SelectItem>
        {projetos.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
