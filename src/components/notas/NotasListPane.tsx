import { useMemo, useState } from "react";
import { LayoutGrid, List, Pin, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { conteudoDaNota, type AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import type { NotaPasta } from "@/hooks/useNotasPastas";
import type { FiltroNotas } from "./NotasFoldersPane";
import { confirmar } from "@/components/DialogosGlobais";

interface NotasListPaneProps {
  notas: AssistantDocumento[];
  // Só precisa quando filtro.tipo === "lixeira" — no Jarvis compacto (sem
  // pastas/filtro) nunca é usado.
  notasLixeira?: AssistantDocumento[];
  pastas?: NotaPasta[];
  filtro?: FiltroNotas;
  loading: boolean;
  notaSelecionadaId: string | null;
  onSelecionar: (id: string) => void;
  onCriar: () => void;
  onRestaurar?: (id: string) => void;
  onExcluirPermanente?: (id: string) => void;
  // Densidade — o Jarvis compacto usa menos respiro que a página /notas.
  compact?: boolean;
  // Botão extra no começo da barra (página /notas: mostrar/ocultar pastas).
  acaoEsquerda?: React.ReactNode;
}

function dentroDeDias(dataIso: string, dias: number): boolean {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  return diffMs >= 0 && diffMs <= dias * 24 * 60 * 60 * 1000;
}

function ehHoje(dataIso: string): boolean {
  const d = new Date(dataIso);
  const agora = new Date();
  return d.toDateString() === agora.toDateString();
}

function ehOntem(dataIso: string): boolean {
  const d = new Date(dataIso);
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  return d.toDateString() === ontem.toDateString();
}

// Seções ao estilo Apple Notes (item 5, rodada 4) — Fixadas sempre no topo
// (não importa a data), depois Hoje/Ontem/Últimos 7 dias/Anteriores. A
// Lixeira continua uma lista plana por data, sem seções (mesmo critério que
// apps de notas usam pra lixeira).
function agruparPorSecao(notas: AssistantDocumento[]): { titulo: string; itens: AssistantDocumento[] }[] {
  const porData = (lista: AssistantDocumento[]) => [...lista].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const fixadas = notas.filter((n) => n.fixado);
  const resto = notas.filter((n) => !n.fixado);
  const hoje = resto.filter((n) => ehHoje(n.updated_at));
  const ontem = resto.filter((n) => !ehHoje(n.updated_at) && ehOntem(n.updated_at));
  const semana = resto.filter((n) => !ehHoje(n.updated_at) && !ehOntem(n.updated_at) && dentroDeDias(n.updated_at, 7));
  const anteriores = resto.filter((n) => !ehHoje(n.updated_at) && !ehOntem(n.updated_at) && !dentroDeDias(n.updated_at, 7));
  return [
    { titulo: "Fixadas", itens: porData(fixadas) },
    { titulo: "Hoje", itens: porData(hoje) },
    { titulo: "Ontem", itens: porData(ontem) },
    { titulo: "Últimos 7 dias", itens: porData(semana) },
    { titulo: "Anteriores", itens: porData(anteriores) },
  ].filter((s) => s.itens.length > 0);
}

// Lista de notas (item 2/9): busca real (título + conteúdo) + filtro vindo
// da Coluna 1 (pasta/fixadas/hoje/7 dias/lixeira) + fixadas primeiro +
// alternância lista/galeria. Usada tanto no Jarvis compacto (sem `filtro`/
// `pastas`, só a lista simples de sempre) quanto na página /notas.
export function NotasListPane({
  notas,
  notasLixeira,
  pastas,
  filtro,
  loading,
  notaSelecionadaId,
  onSelecionar,
  onCriar,
  onRestaurar,
  onExcluirPermanente,
  compact,
  acaoEsquerda,
}: NotasListPaneProps) {
  const [busca, setBusca] = useState("");
  // Página /notas abre em galeria (como o Notes); o Jarvis compacto, em lista.
  const [visualizacao, setVisualizacao] = useState<"lista" | "grade">(compact ? "lista" : "grade");

  const naLixeira = filtro?.tipo === "lixeira";

  const filtradas = useMemo(() => {
    const origem = naLixeira ? notasLixeira ?? [] : notas;
    if (!filtro || filtro.tipo === "todas" || filtro.tipo === "lixeira") return origem;
    if (filtro.tipo === "fixadas") return origem.filter((n) => n.fixado);
    if (filtro.tipo === "hoje") return origem.filter((n) => ehHoje(n.updated_at));
    if (filtro.tipo === "semana") return origem.filter((n) => dentroDeDias(n.updated_at, 7));
    if (filtro.tipo === "pasta") return origem.filter((n) => n.pasta_id === filtro.pastaId);
    return origem;
  }, [naLixeira, notasLixeira, notas, filtro]);

  const ordenadas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const buscadas = termo
      ? filtradas.filter((n) => `${n.titulo} ${conteudoDaNota(n)}`.toLowerCase().includes(termo))
      : filtradas;
    return [...buscadas].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [filtradas, busca]);

  // Seções tipo Apple Notes (item 5) — Lixeira fica flat (uma seção sem
  // título), o resto ganha Fixadas/Hoje/Ontem/Últimos 7 dias/Anteriores.
  const secoes = useMemo<{ titulo: string | null; itens: AssistantDocumento[] }[]>(
    () => (naLixeira ? [{ titulo: null, itens: ordenadas }] : agruparPorSecao(ordenadas)),
    [naLixeira, ordenadas],
  );

  const previewDe = (nota: AssistantDocumento) =>
    conteudoDaNota(nota).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, compact ? 60 : 260);

  const nomePastaDe = (nota: AssistantDocumento) => pastas?.find((p) => p.id === nota.pasta_id)?.nome ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2", compact ? "pb-2" : "pb-3")}>
        {acaoEsquerda}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar notas..."
            className={cn("pl-7", compact ? "h-8 text-sm" : "h-9 text-sm")}
          />
        </div>
        {!compact && (
          <div className="flex shrink-0 items-center rounded-md bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setVisualizacao("lista")}
              className={cn("rounded p-1", visualizacao === "lista" ? "bg-background shadow-sm" : "text-muted-foreground")}
              aria-label="Ver em lista"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setVisualizacao("grade")}
              className={cn("rounded p-1", visualizacao === "grade" ? "bg-background shadow-sm" : "text-muted-foreground")}
              aria-label="Ver em galeria"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {!naLixeira && (
          <Button type="button" size="icon" variant="secondary" className="h-8 w-8 shrink-0" onClick={onCriar} aria-label="Nova nota">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : ordenadas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {busca ? "Nenhuma nota encontrada." : naLixeira ? "A lixeira está vazia." : "Nenhuma nota ainda."}
          </p>
        ) : (
          secoes.map((secao) => (
            <div key={secao.titulo ?? "flat"} className="space-y-1">
              {secao.titulo && (
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{secao.titulo}</p>
              )}
              {visualizacao === "grade" && !compact && !naLixeira ? (
                // Galeria tipo Notes: miniatura com título + começo do texto,
                // e embaixo o título e a data.
                <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-5 pt-1">
                  {secao.itens.map((nota) => (
                    <button key={nota.id} type="button" onClick={() => onSelecionar(nota.id)} className="group flex min-w-0 flex-col items-center text-center">
                      <div className="h-36 w-full overflow-hidden rounded-lg border border-border bg-background p-3 text-left shadow-sm transition-colors group-hover:border-primary/50">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug">{nota.titulo || "Nota sem título"}</p>
                        <p className="mt-1.5 line-clamp-5 text-[11px] leading-relaxed text-muted-foreground">{previewDe(nota)}</p>
                      </div>
                      <p className="mt-2 flex w-full items-center justify-center gap-1 truncate text-sm font-medium">
                        {nota.fixado && <Pin className="h-3 w-3 shrink-0 fill-current text-amber-500" />}
                        <span className="truncate">{nota.titulo || "Nota sem título"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{format(new Date(nota.updated_at), ehHoje(nota.updated_at) ? "HH:mm" : "dd/MM/yyyy")}</p>
                      {nomePastaDe(nota) && <p className="truncate text-[11px] text-muted-foreground/70">{nomePastaDe(nota)}</p>}
                    </button>
                  ))}
                </div>
              ) : (
              <div className="divide-y divide-border/60">
                {secao.itens.map((nota) => {
                  const preview = previewDe(nota);
                  const pastaNome = nomePastaDe(nota);
                  return (
                    <button
                      key={nota.id}
                      type="button"
                      onClick={() => onSelecionar(nota.id)}
                      className={cn(
                        "w-full rounded-lg px-3 text-left transition-colors",
                        compact ? "py-2" : "py-2.5",
                        // Destaque suave (item 4 do pedido) — o bloco sólido
                        // com a cor de accent (verde forte da marca) chamava
                        // demais a atenção pra uma simples seleção de item de
                        // lista; um tingimento leve já deixa claro qual nota
                        // está aberta sem competir com o conteúdo.
                        nota.id === notaSelecionadaId ? "bg-accent/10" : "hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {nota.fixado && !naLixeira && <Pin className="h-3 w-3 shrink-0 fill-current text-amber-500" />}
                        <p className={cn("flex-1 truncate font-medium", compact ? "text-sm" : "text-[15px]")}>{nota.titulo || "Nota sem título"}</p>
                        {naLixeira && (onRestaurar || onExcluirPermanente) && (
                          <span className="flex shrink-0 items-center gap-0.5">
                            {onRestaurar && (
                              <span
                                role="button"
                                tabIndex={0}
                                className="rounded p-1 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRestaurar(nota.id);
                                }}
                                aria-label="Restaurar nota"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </span>
                            )}
                            {onExcluirPermanente && (
                              <span
                                role="button"
                                tabIndex={0}
                                className="rounded p-1 text-muted-foreground hover:text-destructive"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (await confirmar("Excluir esta nota definitivamente? Não dá pra desfazer.")) {
                                    onExcluirPermanente(nota.id);
                                  }
                                }}
                                aria-label="Excluir definitivamente"
                              >
                                <Trash2 className="h-3 w-3" />
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {preview && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{preview}</p>}
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(nota.updated_at), { locale: ptBR, addSuffix: true })}
                        </span>
                        {pastaNome && (
                          <span className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{pastaNome}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
