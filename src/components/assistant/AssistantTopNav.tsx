import { cn } from "@/lib/utils";
import type { FiltroResponsavel } from "@/lib/atividades/filtroResponsavel";

export type AssistantAba = "hoje" | "kanban" | "docs" | "notas" | "performance" | "relatorio";

// Item 4 do pedido: sem aba "Projeto" isolada — o projeto agora é escolhido
// direto dentro de Kanban e Notas (ver ProjetoSelectorInline), e o filtro
// "Dia" que morava aqui foi pra dentro da própria Home (AssistantHojeTab).
// "Performance" (Rotinas + Sono) virou aba própria — antes vivia dentro de
// "Hoje", que tinha ficado com informação demais numa tela só.
const ABAS: { id: AssistantAba; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "performance", label: "Performance" },
  { id: "kanban", label: "Kanban" },
  { id: "docs", label: "Docs" },
  { id: "notas", label: "Notas" },
  // Diário rápido do dia (ver AssistantRelatorioTab).
  { id: "relatorio", label: "Relatório" },
];

interface AssistantTopNavProps {
  aba: AssistantAba;
  onMudarAba: (aba: AssistantAba) => void;
  filtroResponsavel: FiltroResponsavel;
  onMudarFiltroResponsavel: (filtro: FiltroResponsavel) => void;
}

// Navegação compacta do mini workspace — item 1 do pedido.
export function AssistantTopNav({ aba, onMudarAba, filtroResponsavel, onMudarFiltroResponsavel }: AssistantTopNavProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
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
      {(aba === "hoje" || aba === "kanban") && (
        <select
          value={filtroResponsavel}
          onChange={(event) => onMudarFiltroResponsavel(event.target.value as FiltroResponsavel)}
          aria-label="Filtrar atividades por responsável"
          title="Filtrar atividades por responsável"
          className="h-7 w-[86px] shrink-0 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="todas">Todas</option>
          <option value="minhas">Minhas</option>
          <option value="outras">Outras</option>
          <option value="sem_responsavel">Sem resp.</option>
        </select>
      )}
    </div>
  );
}
