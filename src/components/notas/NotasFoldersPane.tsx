import { useState } from "react";
import { CalendarDays, CalendarRange, FileStack, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NotaPasta } from "@/hooks/useNotasPastas";

export type FiltroNotas =
  | { tipo: "todas" }
  | { tipo: "fixadas" }
  | { tipo: "hoje" }
  | { tipo: "semana" }
  | { tipo: "lixeira" }
  | { tipo: "pasta"; pastaId: string };

export function filtroNotasIguais(a: FiltroNotas, b: FiltroNotas): boolean {
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === "pasta" && b.tipo === "pasta") return a.pastaId === b.pastaId;
  return true;
}

interface NotasFoldersPaneProps {
  pastas: NotaPasta[];
  filtro: FiltroNotas;
  onSelecionarFiltro: (filtro: FiltroNotas) => void;
  onCriarPasta: (nome: string) => void;
  onRenomearPasta: (id: string, nome: string) => void;
  onExcluirPasta: (id: string) => void;
  contagemLixeira: number;
}

function ItemFiltro({ ativo, icone, label, onClick }: { ativo: boolean; icone: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        ativo ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {icone}
      <span className="truncate">{label}</span>
    </button>
  );
}

// Coluna 1 (item 2): filtros fixos (Todas/Fixadas/Hoje/Últimos 7 dias),
// pastas personalizadas (origem "notas" em pastas_atividade, ver
// useNotasPastas.ts) e Lixeira — lista vertical, inspirada na organização
// do Apple Notes sem copiar a identidade visual.
export function NotasFoldersPane({
  pastas,
  filtro,
  onSelecionarFiltro,
  onCriarPasta,
  onRenomearPasta,
  onExcluirPasta,
  contagemLixeira,
}: NotasFoldersPaneProps) {
  const [criando, setCriando] = useState(false);
  const [nomeNovaPasta, setNomeNovaPasta] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");

  const confirmarNovaPasta = () => {
    const nome = nomeNovaPasta.trim();
    if (nome) onCriarPasta(nome);
    setNomeNovaPasta("");
    setCriando(false);
  };

  const confirmarRenomear = (id: string) => {
    const nome = nomeEdicao.trim();
    if (nome) onRenomearPasta(id, nome);
    setEditandoId(null);
  };

  return (
    <div className="flex h-full flex-col gap-0.5 overflow-y-auto">
      <ItemFiltro
        ativo={filtro.tipo === "todas"}
        icone={<FileStack className="h-4 w-4 shrink-0" />}
        label="Todas as notas"
        onClick={() => onSelecionarFiltro({ tipo: "todas" })}
      />
      <ItemFiltro
        ativo={filtro.tipo === "fixadas"}
        icone={<Pin className="h-4 w-4 shrink-0" />}
        label="Fixadas"
        onClick={() => onSelecionarFiltro({ tipo: "fixadas" })}
      />
      <ItemFiltro
        ativo={filtro.tipo === "hoje"}
        icone={<CalendarDays className="h-4 w-4 shrink-0" />}
        label="Hoje"
        onClick={() => onSelecionarFiltro({ tipo: "hoje" })}
      />
      <ItemFiltro
        ativo={filtro.tipo === "semana"}
        icone={<CalendarRange className="h-4 w-4 shrink-0" />}
        label="Últimos 7 dias"
        onClick={() => onSelecionarFiltro({ tipo: "semana" })}
      />

      <div className="my-2 border-t border-border" />

      {pastas.map((pasta) =>
        editandoId === pasta.id ? (
          <div key={pasta.id} className="flex items-center gap-1 px-1">
            <Input
              autoFocus
              value={nomeEdicao}
              onChange={(e) => setNomeEdicao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarRenomear(pasta.id);
                if (e.key === "Escape") setEditandoId(null);
              }}
              onBlur={() => confirmarRenomear(pasta.id)}
              className="h-7 text-sm"
            />
          </div>
        ) : (
          <div key={pasta.id} className="group flex items-center">
            <div className="flex-1">
              <ItemFiltro
                ativo={filtro.tipo === "pasta" && filtro.pastaId === pasta.id}
                icone={<FileStack className="h-4 w-4 shrink-0" />}
                label={pasta.nome}
                onClick={() => onSelecionarFiltro({ tipo: "pasta", pastaId: pasta.id })}
              />
            </div>
            <div className="hidden shrink-0 items-center gap-0.5 pr-1 group-hover:flex">
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEditandoId(pasta.id);
                  setNomeEdicao(pasta.nome);
                }}
                aria-label="Renomear pasta"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (window.confirm(`Excluir a pasta "${pasta.nome}"? As notas continuam existindo, só saem da pasta.`)) {
                    onExcluirPasta(pasta.id);
                  }
                }}
                aria-label="Excluir pasta"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ),
      )}

      {criando ? (
        <div className="flex items-center gap-1 px-1">
          <Input
            autoFocus
            value={nomeNovaPasta}
            onChange={(e) => setNomeNovaPasta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarNovaPasta();
              if (e.key === "Escape") setCriando(false);
            }}
            onBlur={confirmarNovaPasta}
            placeholder="Nome da pasta"
            className="h-7 text-sm"
          />
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setCriando(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 justify-start gap-2 px-2 text-xs text-muted-foreground"
          onClick={() => setCriando(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova pasta
        </Button>
      )}

      <div className="mt-auto pt-2">
        <div className="border-t border-border pt-2">
          <ItemFiltro
            ativo={filtro.tipo === "lixeira"}
            icone={<Trash2 className="h-4 w-4 shrink-0" />}
            label={contagemLixeira > 0 ? `Lixeira (${contagemLixeira})` : "Lixeira"}
            onClick={() => onSelecionarFiltro({ tipo: "lixeira" })}
          />
        </div>
      </div>
    </div>
  );
}
