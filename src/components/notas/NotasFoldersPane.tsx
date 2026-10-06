import { useState } from "react";
import { CalendarDays, CalendarRange, ChevronsUpDown, Check, FileStack, Folder, Pin, Plus, Sparkles, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NotaPasta } from "@/hooks/useNotasPastas";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import { confirmar } from "@/components/DialogosGlobais";

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

function ehHoje(dataIso: string): boolean {
  const d = new Date(dataIso);
  const agora = new Date();
  return d.toDateString() === agora.toDateString();
}

function dentroDeDias(dataIso: string, dias: number): boolean {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  return diffMs >= 0 && diffMs <= dias * 24 * 60 * 60 * 1000;
}

interface Projeto {
  id: string;
  nome: string;
}

interface NotasFoldersPaneProps {
  projetos: Projeto[];
  loadingProjetos: boolean;
  projetoId: string | null;
  onSelecionarProjeto: (id: string) => void;
  notas: AssistantDocumento[];
  pastas: NotaPasta[];
  filtro: FiltroNotas;
  onSelecionarFiltro: (filtro: FiltroNotas) => void;
  onCriarPasta: (nome: string) => void;
  onRenomearPasta: (id: string, nome: string) => void;
  onExcluirPasta: (id: string) => void;
  contagemLixeira: number;
}

function Contador({ n }: { n: number }) {
  return <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground/80">{n}</span>;
}

function ItemFiltro({
  ativo,
  icone,
  label,
  contagem,
  onClick,
}: {
  ativo: boolean;
  icone: React.ReactNode;
  label: string;
  contagem?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[15px] transition-colors",
        ativo ? "bg-accent font-medium text-foreground" : "text-foreground/85 hover:bg-accent/60",
      )}
    >
      {icone}
      <span className="flex-1 truncate">{label}</span>
      {contagem !== undefined && <Contador n={contagem} />}
    </button>
  );
}

// Coluna única de navegação (rodada "imitar Apple Notes"): no topo, um
// seletor compacto de projeto (equivalente ao switch de conta "iCloud" do
// Notes — cada projeto tem seu próprio espaço de pastas/notas); depois os
// filtros rápidos (Todas/Fixadas/Hoje/7 dias) e as pastas do projeto, cada
// item com ícone + contador à direita, igual ao app nativo. Lixeira fixada
// embaixo. Substitui a antiga coluna separada "Projetos" + coluna de
// pastas — agora é uma sidebar só, mais parecida com o Notes de verdade.
export function NotasFoldersPane({
  projetos,
  loadingProjetos,
  projetoId,
  onSelecionarProjeto,
  notas,
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

  const projetoAtual = projetos.find((p) => p.id === projetoId);
  const totalNotas = notas.length;
  const totalFixadas = notas.filter((n) => n.fixado).length;
  const totalHoje = notas.filter((n) => ehHoje(n.updated_at)).length;
  const totalSemana = notas.filter((n) => dentroDeDias(n.updated_at, 7)).length;
  const contagemPasta = (pastaId: string) => notas.filter((n) => n.pasta_id === pastaId).length;

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
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-1 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={loadingProjetos || projetos.length === 0}
            className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60 disabled:opacity-60"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {loadingProjetos ? "Carregando..." : projetoAtual?.nome ?? "Selecionar projeto"}
              </span>
              <span className="block text-[11px] text-muted-foreground">{projetos.length} projetos</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {projetos.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => onSelecionarProjeto(p.id)} className="gap-2">
              <Check className={cn("h-3.5 w-3.5 shrink-0", p.id === projetoId ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{p.nome}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ItemFiltro
        ativo={filtro.tipo === "todas"}
        icone={<FileStack className="h-4 w-4 shrink-0" />}
        label="Todas as notas"
        contagem={totalNotas}
        onClick={() => onSelecionarFiltro({ tipo: "todas" })}
      />
      <ItemFiltro
        ativo={filtro.tipo === "fixadas"}
        icone={<Pin className="h-4 w-4 shrink-0" />}
        label="Fixadas"
        contagem={totalFixadas}
        onClick={() => onSelecionarFiltro({ tipo: "fixadas" })}
      />
      <ItemFiltro
        ativo={filtro.tipo === "hoje"}
        icone={<CalendarDays className="h-4 w-4 shrink-0" />}
        label="Hoje"
        contagem={totalHoje}
        onClick={() => onSelecionarFiltro({ tipo: "hoje" })}
      />
      <ItemFiltro
        ativo={filtro.tipo === "semana"}
        icone={<CalendarRange className="h-4 w-4 shrink-0" />}
        label="Últimos 7 dias"
        contagem={totalSemana}
        onClick={() => onSelecionarFiltro({ tipo: "semana" })}
      />

      <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Pastas</p>

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
              className="h-8 text-sm"
            />
          </div>
        ) : (
          <div key={pasta.id} className="group flex items-center">
            <div className="min-w-0 flex-1">
              <ItemFiltro
                ativo={filtro.tipo === "pasta" && filtro.pastaId === pasta.id}
                icone={<Folder className="h-4 w-4 shrink-0" />}
                label={pasta.nome}
                contagem={contagemPasta(pasta.id)}
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
                onClick={async () => {
                  if (await confirmar(`Excluir a pasta "${pasta.nome}"? As notas continuam existindo, só saem da pasta.`)) {
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
            className="h-8 text-sm"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCriando(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 justify-start gap-2 px-3 text-[13px] text-muted-foreground hover:text-foreground"
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
            label="Lixeira"
            contagem={contagemLixeira}
            onClick={() => onSelecionarFiltro({ tipo: "lixeira" })}
          />
        </div>
      </div>
    </div>
  );
}
