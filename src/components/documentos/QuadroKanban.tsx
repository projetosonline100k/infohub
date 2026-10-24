import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { GripVertical, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Quadro com colunas dentro do documento (24/10, Davi: "ao digitar / mostrar coisas especiais: criar colunas e ir
// preenchendo, tipo kanban, na mesma lógica do Notion"). Um bloco do TipTap que guarda as colunas e os cartões
// num atributo (JSON) do próprio documento: salva junto com o texto, sem tabela nova. Arrastar cartão entre
// colunas é por ponteiro (o arrastar nativo e o da biblioteca se perdem dentro das guias, que têm transform).

export interface Cartao { id: string; texto: string }
export interface Coluna { id: string; titulo: string; cor: string; cartoes: Cartao[] }
export interface DadosQuadro { colunas: Coluna[] }

const CORES = ["#94a3b8", "#60a5fa", "#fbbf24", "#34d399", "#f472b6", "#a78bfa", "#f87171"];
const novoId = () => Math.random().toString(36).slice(2, 10);

export function quadroPadrao(): DadosQuadro {
  return {
    colunas: [
      { id: novoId(), titulo: "A fazer", cor: CORES[0], cartoes: [] },
      { id: novoId(), titulo: "Fazendo", cor: CORES[1], cartoes: [] },
      { id: novoId(), titulo: "Feito", cor: CORES[3], cartoes: [] },
    ],
  };
}

function lerDados(v: unknown): DadosQuadro {
  try {
    const d = typeof v === "string" ? JSON.parse(v) : v;
    if (d && Array.isArray((d as DadosQuadro).colunas)) return d as DadosQuadro;
  } catch { /* quadro estragado: começa do padrão */ }
  return quadroPadrao();
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

function VistaQuadro({ node, updateAttributes, deleteNode, editor, selected }: NodeViewProps) {
  const dados = lerDados(node.attrs.dados);
  const editavel = editor.isEditable;
  const [focarCartao, setFocarCartao] = useState<string | null>(null);
  const [arrasto, setArrasto] = useState<{ cartao: string; de: string; para: string | null; antes: string | null } | null>(null);
  const inicio = useRef<{ x: number; y: number; cartao: string; de: string } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const salvar = (novo: DadosQuadro) => updateAttributes({ dados: JSON.stringify(novo) });
  const mudarColuna = (id: string, f: (c: Coluna) => Coluna) => salvar({ colunas: dados.colunas.map((c) => (c.id === id ? f(c) : c)) });

  const novoCartao = (colunaId: string) => {
    const id = novoId();
    mudarColuna(colunaId, (c) => ({ ...c, cartoes: [...c.cartoes, { id, texto: "" }] }));
    setFocarCartao(id);
  };
  const novaColuna = () => salvar({ colunas: [...dados.colunas, { id: novoId(), titulo: "", cor: CORES[dados.colunas.length % CORES.length], cartoes: [] }] });

  // Arrastar cartão: segura e move (5 px) → mostra onde cai; solta → muda de coluna/posição.
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const ini = inicio.current;
      if (!ini) return;
      if (Math.abs(e.clientX - ini.x) < 5 && Math.abs(e.clientY - ini.y) < 5 && !arrastoRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const col = el?.closest<HTMLElement>("[data-quadro-coluna]");
      if (!col || !caixa.current?.contains(col)) { setArrasto({ cartao: ini.cartao, de: ini.de, para: null, antes: null }); return; }
      // Antes de qual cartão: o primeiro cuja metade fica abaixo do ponteiro.
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
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quadro</span>
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
          return (
            <div key={col.id} data-quadro-coluna={col.id} className={cn("w-60 shrink-0 rounded-lg p-1.5 transition-colors", alvo ? "bg-primary/10" : "bg-muted/40")}>
              <div className="group/col mb-1.5 flex items-center gap-1.5 px-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={!editavel}>
                    <button type="button" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.cor }} aria-label="Cor da coluna" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="flex w-auto gap-1.5 p-2">
                    {CORES.map((c) => <button key={c} type="button" className="h-5 w-5 rounded-full" style={{ background: c }} onClick={() => mudarColuna(col.id, (x) => ({ ...x, cor: c }))} />)}
                  </DropdownMenuContent>
                </DropdownMenu>
                {editavel
                  ? <CampoTexto valor={col.titulo} onMudar={(v) => mudarColuna(col.id, (x) => ({ ...x, titulo: v }))} placeholder="Nome da coluna" className="text-sm font-semibold" />
                  : <span className="flex-1 text-sm font-semibold">{col.titulo}</span>}
                <span className="text-xs tabular-nums text-muted-foreground">{col.cartoes.length}</span>
                {editavel && (
                  <button type="button" title="Apagar coluna" className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover/col:opacity-100"
                    onClick={() => { if (!col.cartoes.length || window.confirm(`Apagar a coluna "${col.titulo || "sem nome"}" e os ${col.cartoes.length} cartões?`)) salvar({ colunas: dados.colunas.filter((c) => c.id !== col.id) }); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {col.cartoes.map((card) => (
                  <div key={card.id}>
                    {alvo && arrasto?.antes === card.id && <div className="mb-1.5 h-0.5 rounded bg-primary" />}
                    <div data-quadro-cartao={card.id}
                      className={cn("group/card flex items-start gap-1 rounded-md border bg-card px-2 py-1.5 text-sm shadow-sm", arrasto?.cartao === card.id && "opacity-40")}>
                      {editavel && (
                        <span title="Segure e arraste para outra coluna" className="mt-0.5 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                          onPointerDown={(e) => { e.preventDefault(); document.body.style.userSelect = "none"; inicio.current = { x: e.clientX, y: e.clientY, cartao: card.id, de: col.id }; }}>
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {editavel
                        ? <CampoTexto valor={card.texto} autoFocus={focarCartao === card.id} placeholder="Escreva…" onEnter={() => novoCartao(col.id)}
                            onMudar={(v) => mudarColuna(col.id, (x) => ({ ...x, cartoes: x.cartoes.map((c) => (c.id === card.id ? { ...c, texto: v } : c)) }))} />
                        : <span className="flex-1 whitespace-pre-wrap">{card.texto}</span>}
                      {editavel && (
                        <button type="button" title="Apagar cartão" className="mt-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover/card:opacity-100"
                          onClick={() => mudarColuna(col.id, (x) => ({ ...x, cartoes: x.cartoes.filter((c) => c.id !== card.id) }))}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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

  // No HTML salvo vai também o texto (colunas e cartões), para quem lê o documento como texto (a IA, a busca).
  renderHTML({ HTMLAttributes, node }) {
    const d = lerDados(node.attrs.dados);
    return ["div", mergeAttributes(HTMLAttributes, { "data-quadro-kanban": "" }),
      ...d.colunas.map((c) => ["div", { "data-coluna": c.titulo }, ["strong", {}, c.titulo || "Coluna"], ["ul", {}, ...c.cartoes.map((x) => ["li", {}, x.texto])]])];
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
