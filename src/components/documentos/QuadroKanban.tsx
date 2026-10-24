import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ChevronUp, GripVertical, MoreHorizontal, Plus, Tag, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CORES_COLUNA, corpoDoCartao, etiquetasDoQuadro, lerDados, normalizarEtiqueta, novoId, quadroPadrao, textoDoQuadro, tituloDoCartao,
  type Cartao, type Coluna, type DadosQuadro,
} from "@/lib/documentos/quadro";

// Quadro com colunas dentro do documento (24/10, Davi: "ao digitar / mostrar coisas especiais: criar colunas e ir
// preenchendo, tipo kanban, na mesma lógica do Notion"). Um bloco do TipTap que guarda as colunas e os cartões
// num atributo (JSON) do próprio documento: salva junto com o texto, sem tabela nova. Arrastar cartão entre
// colunas é por ponteiro (o arrastar nativo e o da biblioteca se perdem dentro das guias, que têm transform).
// 24/10 (2ª): cartão pequeno (título + 2 linhas + etiquetas) que abre ao clicar, e etiquetas para a IA achar
// o cartão certo na hora de escrever roteiro (lib/documentos/quadro.ts → chat do documento).

/** Cor fixa por etiqueta (a mesma etiqueta tem sempre a mesma cor). */
function corDaEtiqueta(t: string) {
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360;
  // Claro (papel, tema claro) pede texto mais escuro: --etiqueta-l vem do tema (index.css).
  return { background: `hsl(${h} 45% 50% / 0.16)`, color: `hsl(${h} 55% var(--etiqueta-l, 62%))`, borderColor: `hsl(${h} 45% 50% / 0.35)` };
}

function Etiqueta({ texto, onTirar, onClick, ativa }: { texto: string; onTirar?: () => void; onClick?: () => void; ativa?: boolean }) {
  return (
    <span onClick={onClick} style={corDaEtiqueta(texto)}
      className={cn("inline-flex max-w-full items-center gap-0.5 truncate rounded border px-1.5 py-px text-[10.5px] font-medium", onClick && "cursor-pointer", ativa && "ring-1 ring-current")}>
      #{texto}
      {onTirar && <button type="button" onClick={(e) => { e.stopPropagation(); onTirar(); }} className="opacity-60 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>}
    </span>
  );
}

/** Texto que se adapta à altura (cartão e título). */
function CampoTexto({ valor, onMudar, placeholder, className, autoFocus, onEnter }: {
  valor: string; onMudar: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; onEnter?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // O quadro nasce fora da tela (o editor monta antes de mostrar): mede de novo no próximo quadro.
    const medir = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`;
    };
    medir();
    const q = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(q);
  }, [valor]);
  // Cartão novo: o foco vai para ele depois que o editor termina de desenhar o quadro de novo.
  useEffect(() => {
    if (!autoFocus) return;
    const q = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(q);
  }, [autoFocus]);
  return (
    <textarea ref={ref} value={valor} rows={1} autoFocus={autoFocus} placeholder={placeholder}
      onChange={(e) => onMudar(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && onEnter) { e.preventDefault(); onEnter(); } }}
      className={cn("min-h-[1.25rem] w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/60", className)} />
  );
}

/** Campo de etiqueta: Enter ou vírgula adiciona; sugere as que o quadro já usa. */
function NovaEtiqueta({ existentes, jaTem, onAdicionar }: { existentes: string[]; jaTem: string[]; onAdicionar: (t: string) => void }) {
  const [valor, setValor] = useState("");
  const sugestoes = existentes.filter((e) => !jaTem.includes(e) && (!valor || e.includes(normalizarEtiqueta(valor)))).slice(0, 6);
  const adicionar = (t: string) => { const n = normalizarEtiqueta(t); if (n) onAdicionar(n); setValor(""); };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5">
        <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="etiqueta (Enter)"
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && valor.trim()) { e.preventDefault(); adicionar(valor); } }}
          className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/60" />
      </div>
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-1">{sugestoes.map((s) => <Etiqueta key={s} texto={s} onClick={() => adicionar(s)} />)}</div>
      )}
    </div>
  );
}

function VistaQuadro({ node, updateAttributes, deleteNode, editor, selected }: NodeViewProps) {
  const dados = lerDados(node.attrs.dados);
  const editavel = editor.isEditable;
  const [aberto, setAberto] = useState<string | null>(null);
  const [focarCartao, setFocarCartao] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [arrasto, setArrasto] = useState<{ cartao: string; de: string; para: string | null; antes: string | null } | null>(null);
  const inicio = useRef<{ x: number; y: number; cartao: string; de: string } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const todasEtiquetas = etiquetasDoQuadro(dados);

  const salvar = (novo: DadosQuadro) => updateAttributes({ dados: JSON.stringify(novo) });
  const mudarColuna = (id: string, f: (c: Coluna) => Coluna) => salvar({ colunas: dados.colunas.map((c) => (c.id === id ? f(c) : c)) });
  const mudarCartao = (colunaId: string, cartaoId: string, f: (c: Cartao) => Cartao) =>
    mudarColuna(colunaId, (x) => ({ ...x, cartoes: x.cartoes.map((c) => (c.id === cartaoId ? f(c) : c)) }));

  const novoCartao = (colunaId: string) => {
    const id = novoId();
    mudarColuna(colunaId, (c) => ({ ...c, cartoes: [...c.cartoes, { id, titulo: "", texto: "", etiquetas: filtro ? [filtro] : [] }] }));
    setAberto(id);
    setFocarCartao(id);
  };
  const novaColuna = () => salvar({ colunas: [...dados.colunas, { id: novoId(), titulo: "", cor: CORES_COLUNA[dados.colunas.length % CORES_COLUNA.length], cartoes: [] }] });

  // Arrastar cartão: segura a alcinha e move (5 px) → mostra onde cai; solta → muda de coluna/posição.
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const ini = inicio.current;
      if (!ini) return;
      if (Math.abs(e.clientX - ini.x) < 5 && Math.abs(e.clientY - ini.y) < 5 && !arrastoRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const col = el?.closest<HTMLElement>("[data-quadro-coluna]");
      if (!col || !caixa.current?.contains(col)) { setArrasto({ cartao: ini.cartao, de: ini.de, para: null, antes: null }); return; }
      const cards = [...col.querySelectorAll<HTMLElement>("[data-quadro-cartao]")].filter((c) => c.dataset.quadroCartao !== ini.cartao);
      const antes = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; })?.dataset.quadroCartao ?? null;
      setArrasto({ cartao: ini.cartao, de: ini.de, para: col.dataset.quadroColuna ?? null, antes });
    };
    const soltar = () => {
      const a = arrastoRef.current;
      inicio.current = null;
      setArrasto(null);
      document.body.style.userSelect = "";
      if (!a?.para) return;
      const atual = lerDados(nodeRef.current.attrs.dados);
      const cartao = atual.colunas.find((c) => c.id === a.de)?.cartoes.find((x) => x.id === a.cartao);
      if (!cartao) return;
      const colunas = atual.colunas.map((c) => ({ ...c, cartoes: c.cartoes.filter((x) => x.id !== a.cartao) }));
      const destino = colunas.find((c) => c.id === a.para);
      if (!destino) return;
      const i = a.antes ? destino.cartoes.findIndex((x) => x.id === a.antes) : -1;
      destino.cartoes.splice(i < 0 ? destino.cartoes.length : i, 0, cartao);
      updateRef.current({ dados: JSON.stringify({ colunas }) });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
  }, []);
  const arrastoRef = useRef(arrasto); arrastoRef.current = arrasto;
  const nodeRef = useRef(node); nodeRef.current = node;
  const updateRef = useRef(updateAttributes); updateRef.current = updateAttributes;

  return (
    <NodeViewWrapper className={cn("quadro-kanban not-prose my-4 rounded-xl border bg-muted/20 p-3", selected && "ring-2 ring-primary/40")} contentEditable={false} data-drag-handle="">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quadro</span>
        {/* Filtrar por etiqueta: mostra só os cartões com ela (o cartão novo já nasce com ela). */}
        {todasEtiquetas.map((t) => <Etiqueta key={t} texto={t} ativa={filtro === t} onClick={() => setFiltro(filtro === t ? null : t)} />)}
        {filtro && <button type="button" onClick={() => setFiltro(null)} className="text-[11px] text-muted-foreground hover:text-foreground">limpar filtro</button>}
        {editavel && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Opções do quadro"><MoreHorizontal className="h-4 w-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={novaColuna}><Plus className="mr-2 h-4 w-4" />Nova coluna</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => deleteNode()}><Trash2 className="mr-2 h-4 w-4" />Apagar quadro</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div ref={caixa} className="scrollbar-thin flex items-start gap-3 overflow-x-auto pb-1">
        {dados.colunas.map((col) => {
          const alvo = arrasto?.para === col.id;
          const visiveis = filtro ? col.cartoes.filter((c) => (c.etiquetas ?? []).map(normalizarEtiqueta).includes(filtro)) : col.cartoes;
          return (
            <div key={col.id} data-quadro-coluna={col.id} className={cn("w-60 shrink-0 rounded-lg p-1.5 transition-colors", alvo ? "bg-primary/10" : "bg-muted/40")}>
              <div className="group/col mb-1.5 flex items-center gap-1.5 px-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={!editavel}>
                    <button type="button" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.cor }} aria-label="Cor da coluna" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="flex w-auto gap-1.5 p-2">
                    {CORES_COLUNA.map((c) => <button key={c} type="button" className="h-5 w-5 rounded-full" style={{ background: c }} onClick={() => mudarColuna(col.id, (x) => ({ ...x, cor: c }))} />)}
                  </DropdownMenuContent>
                </DropdownMenu>
                {editavel
                  ? <CampoTexto valor={col.titulo} onMudar={(v) => mudarColuna(col.id, (x) => ({ ...x, titulo: v }))} placeholder="Nome da coluna" className="text-sm font-semibold" />
                  : <span className="flex-1 text-sm font-semibold">{col.titulo}</span>}
                <span className="text-xs tabular-nums text-muted-foreground">{visiveis.length}</span>
                {editavel && (
                  <button type="button" title="Apagar coluna" className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover/col:opacity-100"
                    onClick={() => { if (!col.cartoes.length || window.confirm(`Apagar a coluna "${col.titulo || "sem nome"}" e os ${col.cartoes.length} cartões?`)) salvar({ colunas: dados.colunas.filter((c) => c.id !== col.id) }); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {visiveis.map((card) => {
                  const estaAberto = aberto === card.id;
                  const titulo = tituloDoCartao(card);
                  const corpo = corpoDoCartao(card);
                  const etiquetas = (card.etiquetas ?? []).map(normalizarEtiqueta);
                  return (
                    <div key={card.id}>
                      {alvo && arrasto?.antes === card.id && <div className="mb-1.5 h-0.5 rounded bg-primary" />}
                      <div data-quadro-cartao={card.id}
                        className={cn("group/card rounded-md border bg-card px-2 py-1.5 text-sm shadow-sm", arrasto?.cartao === card.id && "opacity-40", estaAberto && "ring-1 ring-primary/40")}>
                        <div className="flex items-start gap-1">
                          {editavel && (
                            <span title="Segure e arraste para outra coluna" className="mt-0.5 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                              onPointerDown={(e) => { e.preventDefault(); document.body.style.userSelect = "none"; inicio.current = { x: e.clientX, y: e.clientY, cartao: card.id, de: col.id }; }}>
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {estaAberto && editavel ? (
                            // Aberto: título, texto inteiro e etiquetas, tudo editável.
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <CampoTexto valor={card.titulo ?? titulo} autoFocus={focarCartao === card.id} placeholder="Título" className="text-sm font-semibold"
                                onMudar={(v) => mudarCartao(col.id, card.id, (c) => ({ ...c, titulo: v, texto: (c.titulo ?? "").trim() ? c.texto : corpoDoCartao(c) }))} />
                              <CampoTexto valor={(card.titulo ?? "").trim() ? card.texto : corpo} placeholder="Escreva (roteiro, transcrição, ideia…)" className="text-[13px] leading-relaxed text-foreground/90"
                                onMudar={(v) => mudarCartao(col.id, card.id, (c) => ({ ...c, titulo: (c.titulo ?? "").trim() ? c.titulo : tituloDoCartao(c), texto: v }))} />
                              <div className="flex flex-wrap gap-1">
                                {etiquetas.map((t) => <Etiqueta key={t} texto={t} onTirar={() => mudarCartao(col.id, card.id, (c) => ({ ...c, etiquetas: (c.etiquetas ?? []).filter((x) => normalizarEtiqueta(x) !== t) }))} />)}
                              </div>
                              <NovaEtiqueta existentes={todasEtiquetas} jaTem={etiquetas}
                                onAdicionar={(t) => mudarCartao(col.id, card.id, (c) => ({ ...c, etiquetas: [...new Set([...(c.etiquetas ?? []).map(normalizarEtiqueta), t])] }))} />
                              <button type="button" onClick={() => setAberto(null)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                                <ChevronUp className="h-3 w-3" />Fechar
                              </button>
                            </div>
                          ) : (
                            // Fechado: pequeno (título, 2 linhas e as etiquetas); clicar abre.
                            <button type="button" onClick={() => editavel && setAberto(card.id)} className="min-w-0 flex-1 space-y-1 text-left">
                              <p className="line-clamp-2 font-semibold leading-snug">{titulo || <span className="font-normal text-muted-foreground">Sem título</span>}</p>
                              {corpo && <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">{corpo}</p>}
                              {etiquetas.length > 0 && <div className="flex flex-wrap gap-1">{etiquetas.map((t) => <Etiqueta key={t} texto={t} />)}</div>}
                            </button>
                          )}
                          {editavel && (
                            <button type="button" title="Apagar cartão" className="mt-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover/card:opacity-100"
                              onClick={() => { if (!corpo || window.confirm(`Apagar o cartão "${titulo || "sem título"}"?`)) mudarColuna(col.id, (x) => ({ ...x, cartoes: x.cartoes.filter((c) => c.id !== card.id) })); }}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {alvo && arrasto?.antes === null && <div className="h-0.5 rounded bg-primary" />}
                {editavel && (
                  <button type="button" onClick={() => novoCartao(col.id)}
                    className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Plus className="h-3.5 w-3.5" />Novo
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {editavel && (
          <button type="button" onClick={novaColuna}
            className="flex h-9 w-40 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />Coluna
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    quadroKanban: { inserirQuadro: () => ReturnType };
  }
}

export const QuadroKanban = Node.create({
  name: "quadroKanban",
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      dados: {
        default: JSON.stringify(quadroPadrao()),
        parseHTML: (el) => el.getAttribute("data-dados") ?? JSON.stringify(quadroPadrao()),
        renderHTML: (attrs) => ({ "data-dados": attrs.dados }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-quadro-kanban]" }];
  },

  // No HTML salvo vai também o texto (colunas, cartões e etiquetas), para quem lê o documento como texto (a IA com @, a busca).
  renderHTML({ HTMLAttributes, node }) {
    const d = lerDados(node.attrs.dados);
    return ["div", mergeAttributes(HTMLAttributes, { "data-quadro-kanban": "" }),
      ...d.colunas.map((c) => ["div", { "data-coluna": c.titulo }, ["strong", {}, c.titulo || "Coluna"],
        ["ul", {}, ...c.cartoes.map((x) => ["li", {}, `${tituloDoCartao(x)}${(x.etiquetas ?? []).length ? ` (#${(x.etiquetas ?? []).join(" #")})` : ""}${corpoDoCartao(x) ? `: ${corpoDoCartao(x)}` : ""}`])]])];
  },

  // O texto do documento que vai para a IA (chat ⌘I) inclui o quadro: sem isto ele seria invisível (é um bloco fechado).
  extendNodeSchema(extension) {
    if (extension.name !== "quadroKanban") return {};
    return { leafText: (n: { attrs: { dados?: unknown } }) => textoDoQuadro(lerDados(n.attrs.dados)) };
  },

  addNodeView() {
    // Tudo o que acontece dentro do quadro é do quadro (o editor não pega clique, tecla nem seleção de lá).
    return ReactNodeViewRenderer(VistaQuadro, { stopEvent: () => true });
  },

  addCommands() {
    return {
      inserirQuadro: () => ({ commands }) => commands.insertContent({ type: this.name, attrs: { dados: JSON.stringify(quadroPadrao()) } }),
    };
  },
});
