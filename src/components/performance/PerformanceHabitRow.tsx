import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Dumbbell, Flower2, HandHeart, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LinhaHabito } from "@/lib/performance/PerformanceMetricsService";
import { formatarValor } from "./format";

interface PerformanceHabitRowProps {
  linha: LinhaHabito;
  onRegistrarBooleano?: (habitId: string, completed: boolean) => void;
  onRegistrarNumero?: (habitId: string, value: number) => void;
  // Variante do Jarvis (painel 460x620): numérico vira só leitura, clicar
  // leva pra Performance completa em vez de abrir um popover apertado ali.
  compact?: boolean;
  onClickCompactNumero?: () => void;
}

// Ícone por palavra-chave no nome do hábito — puramente visual (não é dado
// novo, só uma pista de leitura mais rápida na versão rica da linha); sem
// nenhum match usa um ícone neutro.
const ICONE_POR_PALAVRA: [RegExp, LucideIcon][] = [
  [/academia|exerc[íi]cio|treino|corrid|muscula[çc][ãa]o/i, Dumbbell],
  [/medita/i, Flower2],
  [/leitura|livro|\bler\b/i, BookOpen],
  [/ora[çc][ãa]o|\borar\b|rezar/i, HandHeart],
];

function iconeDoHabito(nome: string): LucideIcon {
  return ICONE_POR_PALAVRA.find(([regexp]) => regexp.test(nome))?.[1] ?? Sparkles;
}

// Linha atômica de um hábito — reaproveitada por PerformanceToday.tsx (aba
// Visão geral, versão rica) e pela seção compacta do Jarvis
// (AssistantRotinasSection, `compact` — visual minimalista inalterado ali).
export function PerformanceHabitRow({ linha, onRegistrarBooleano, onRegistrarNumero, compact, onClickCompactNumero }: PerformanceHabitRowProps) {
  const { habito, completed } = linha;
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(linha.valueNumeric != null ? String(linha.valueNumeric) : "");
  const automatico = habito.source === "automatic";
  const Icone = iconeDoHabito(habito.nome);

  if (habito.tipo === "boolean") {
    if (compact) {
      return (
        <button
          type="button"
          disabled={automatico}
          onClick={() => !automatico && onRegistrarBooleano?.(habito.id, !completed)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors",
            !automatico && "hover:bg-muted/60",
            completed ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <span className="truncate">{habito.nome}</span>
          <span aria-hidden="true" className={cn("shrink-0", completed && "text-status-success")}>
            {completed ? "✓" : "○"}
          </span>
        </button>
      );
    }

    const legenda = completed ? "Concluída hoje" : habito.descricao;
    return (
      <button
        type="button"
        disabled={automatico}
        onClick={() => !automatico && onRegistrarBooleano?.(habito.id, !completed)}
        className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors", !automatico && "hover:bg-muted/40")}
      >
        <span aria-hidden="true" className={cn("shrink-0 text-base", completed ? "text-status-success" : "text-muted-foreground")}>
          {completed ? "✓" : "○"}
        </span>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            completed ? "bg-status-success/15 text-status-success" : "bg-primary/10 text-primary"
          )}
        >
          <Icone className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{habito.nome}</span>
          {legenda && <span className="block truncate text-xs text-muted-foreground">{legenda}</span>}
        </span>
      </button>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={!automatico ? onClickCompactNumero : undefined}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left text-sm"
      >
        <span className="truncate text-muted-foreground">{habito.nome}</span>
        <span className={cn("shrink-0 text-xs", completed ? "text-status-success" : "text-muted-foreground")}>{formatarValor(linha)}</span>
      </button>
    );
  }

  const progresso = habito.meta_diaria ? Math.min(100, ((linha.valueNumeric ?? 0) / habito.meta_diaria) * 100) : null;
  const conteudo = (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
      <span aria-hidden="true" className={cn("shrink-0 text-base", completed ? "text-status-success" : "text-muted-foreground")}>
        {completed ? "✓" : "○"}
      </span>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          completed ? "bg-status-success/15 text-status-success" : "bg-primary/10 text-primary"
        )}
      >
        <Icone className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{habito.nome}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatarValor(linha)}</span>
        </span>
        {progresso != null && (
          <span className="block h-1 w-full overflow-hidden rounded-full bg-secondary">
            <span className={cn("block h-full rounded-full", completed ? "bg-status-success" : "bg-primary")} style={{ width: `${progresso}%` }} />
          </span>
        )}
      </span>
    </div>
  );

  if (automatico) {
    return <div className="w-full opacity-90">{conteudo}</div>;
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full rounded-lg text-left transition-colors hover:bg-muted/40">
          {conteudo}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2">
        <p className="text-xs text-muted-foreground">{habito.nome}</p>
        <div className="flex items-center gap-2">
          <Input type="number" min={0} autoFocus value={valor} onChange={(e) => setValor(e.target.value)} className="h-8" />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onRegistrarNumero?.(habito.id, Number(valor) || 0);
              setAberto(false);
            }}
          >
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
