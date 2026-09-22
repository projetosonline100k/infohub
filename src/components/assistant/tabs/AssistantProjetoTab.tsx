import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { AssistantProjetoOpcao, AssistantFiltroData, AssistantFiltroDia } from "@/hooks/useAssistantProjeto";

const TODOS = "__todos__";

interface AssistantProjetoTabProps {
  projetos: AssistantProjetoOpcao[];
  loadingProjetos: boolean;
  projetoId: string | null;
  onSelecionar: (id: string | null) => void;
  filtroDia: AssistantFiltroData;
  onMudarFiltroDia: (filtro: AssistantFiltroData) => void;
}

const OPCOES_DIA: { id: AssistantFiltroDia; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "amanha", label: "Amanhã" },
  { id: "semana", label: "Esta semana" },
  { id: "data", label: "Data específica" },
];

// Aba "Projeto" — itens 2-3: selecionar em qual projeto (cliente) trabalhar
// e qual recorte de dia olhar, filtrando tarefas/Kanban/Docs/Notas nas
// outras abas.
export function AssistantProjetoTab({ projetos, loadingProjetos, projetoId, onSelecionar, filtroDia, onMudarFiltroDia }: AssistantProjetoTabProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">Projeto atual</p>
          <p className="text-xs text-muted-foreground">Filtra tarefas, Kanban, documentos e notas pelo projeto escolhido.</p>
        </div>
        <Select value={projetoId ?? TODOS} onValueChange={(v) => onSelecionar(v === TODOS ? null : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar projeto" />
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
        {loadingProjetos && <p className="text-xs text-muted-foreground">Carregando projetos...</p>}
        {!loadingProjetos && projetos.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum projeto encontrado — crie um em "Projetos Milionários".</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Dia</p>
        <div className="grid grid-cols-2 gap-1.5">
          {OPCOES_DIA.map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => onMudarFiltroDia({ tipo: op.id, data: op.id === "data" ? filtroDia.data : null })}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filtroDia.tipo === op.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
        {filtroDia.tipo === "data" && (
          <Input
            type="date"
            value={filtroDia.data ?? ""}
            onChange={(e) => onMudarFiltroDia({ tipo: "data", data: e.target.value })}
            className="h-8 text-sm"
          />
        )}
      </div>
    </div>
  );
}
