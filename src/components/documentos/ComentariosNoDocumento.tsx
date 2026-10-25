import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { idsComentariosNoTexto, tirarMarcaComentario } from "@/lib/tiptapComentario";

// Comentários na margem do documento, como no Google Docs (25/10, Davi: "ao selecionar uma palavra, a opção de
// adicionar um comentário"). Selecionou → "Comentar" no menu (ou ⌘⌥M) → escreve → o trecho fica amarelo e o
// cartão aparece na margem direita, na altura do trecho. Dá para responder, resolver (some e tira o amarelo) e
// apagar o seu. Tabela documento_comentarios; a marca no texto guarda o id (lib/tiptapComentario.ts).
const db = supabase as unknown as SupabaseClient;

interface ComentarioDb {
  id: string; documento_id: string; parent_id: string | null; autor_id: string; autor_nome: string | null;
  trecho: string | null; texto: string; resolvido: boolean; created_at: string;
}
interface Novo { de: number; ate: number; trecho: string }

const LARGURA = 260;

export function ComentariosNoDocumento({ editor, documentoId, pedido }: { editor: Editor; documentoId: string; pedido: number }) {
  const { user } = useAuth();
  const [comentarios, setComentarios] = useState<ComentarioDb[]>([]);
  const [novo, setNovo] = useState<Novo | null>(null);
  const [texto, setTexto] = useState("");
  const [ativo, setAtivo] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [versao, setVersao] = useState(0);   // muda quando o texto muda: recalcula onde ficam os cartões
  const [mesa, setMesa] = useState<HTMLElement | null>(null);
  const camada = useRef<HTMLDivElement>(null);
  const meuNome = (user?.user_metadata?.nome as string | undefined) || (user?.user_metadata?.name as string | undefined) || user?.email?.split("@")[0] || "Você";

  const carregar = useCallback(async () => {
    const { data } = await db.from("documento_comentarios").select("*").eq("documento_id", documentoId).order("created_at");
    setComentarios((data ?? []) as ComentarioDb[]);
  }, [documentoId]);
  useEffect(() => { setNovo(null); setAtivo(null); void carregar(); }, [carregar]);
  useEffect(() => {
    const voltou = () => void carregar();
    window.addEventListener("focus", voltou);
    return () => window.removeEventListener("focus", voltou);
  }, [carregar]);

  // A área que rola (a "mesa" em volta da folha): os cartões ficam dentro dela e rolam junto com o texto.
  useEffect(() => {
    const achar = () => {
      const el = editor.view.dom.closest<HTMLElement>(".superficie-mesa");
      if (el && getComputedStyle(el).position === "static") el.style.position = "relative";   // os cartões se posicionam nela
      setMesa(el);
    };
    achar();
    const t = window.setTimeout(achar, 300);
    return () => window.clearTimeout(t);
  }, [editor, documentoId]);

  useEffect(() => {
    const mudou = () => setVersao((v) => v + 1);
    editor.on("update", mudou);
    window.addEventListener("resize", mudou);
    return () => { editor.off("update", mudou); window.removeEventListener("resize", mudou); };
  }, [editor]);

  // Pedido de comentário (botão do menu de seleção, ou ⌘⌥M): guarda o trecho selecionado e abre o cartão novo.
  const comecar = useCallback(() => {
    const { from, to, empty } = editor.state.selection;
    if (empty) { toast.info("Selecione o trecho que você quer comentar"); return; }
    setNovo({ de: from, ate: to, trecho: editor.state.doc.textBetween(from, to, " ").slice(0, 500) });
    setTexto("");
    setAtivo(null);
    // Segurança: desfaz a seleção e tira o foco do texto. Assim, se algo atrasar o cartão, o que for digitado
    // nunca substitui o trecho selecionado (o trecho continua citado no cartão).
    editor.chain().setTextSelection(to).blur().run();
    setMesa((m) => m ?? editor.view.dom.closest<HTMLElement>(".superficie-mesa"));
  }, [editor]);
  // O campo do comentário novo recebe o foco assim que aparece.
  useEffect(() => {
    if (!novo) return;
    const t = window.setTimeout(() => camada.current?.querySelector<HTMLTextAreaElement>('[data-cartao="__novo"] textarea')?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [novo]);
  const ultimoPedido = useRef(pedido);
  useEffect(() => { if (pedido !== ultimoPedido.current) { ultimoPedido.current = pedido; comecar(); } }, [pedido, comecar]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.metaKey && e.altKey && (e.key === "m" || e.key === "µ" || e.code === "KeyM") && editor.isFocused) { e.preventDefault(); comecar(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [editor, comecar]);

  // Clicar no trecho amarelo abre o comentário dele.
  useEffect(() => {
    const clique = (e: MouseEvent) => {
      const id = (e.target as HTMLElement | null)?.closest?.("[data-comentario]")?.getAttribute("data-comentario");
      if (id) setAtivo(id);
    };
    const dom = editor.view.dom;
    dom.addEventListener("click", clique);
    return () => dom.removeEventListener("click", clique);
  }, [editor]);
  // O trecho do comentário aberto fica mais forte.
  useEffect(() => {
    const dom = editor.view.dom;
    dom.querySelectorAll(".comentario-ativo").forEach((el) => el.classList.remove("comentario-ativo"));
    if (ativo) dom.querySelectorAll(`[data-comentario="${ativo}"]`).forEach((el) => el.classList.add("comentario-ativo"));
  }, [ativo, editor, versao, comentarios]);

  const salvarNovo = async () => {
    if (!novo || !texto.trim()) return;
    setSalvando(true);
    const { data, error } = await db.from("documento_comentarios")
      .insert({ documento_id: documentoId, trecho: novo.trecho, texto: texto.trim(), autor_nome: meuNome }).select("*").single();
    setSalvando(false);
    if (error || !data) { toast.error("Não consegui salvar o comentário"); return; }
    const c = data as ComentarioDb;
    // Marca o trecho no texto (vira parte do documento e salva junto).
    editor.chain().setTextSelection({ from: novo.de, to: novo.ate }).setMark("comentario", { id: c.id }).setTextSelection(novo.ate).run();
    setComentarios((l) => [...l, c]);
    setNovo(null);
    setTexto("");
    setAtivo(c.id);
  };
  const responder = async (raiz: ComentarioDb) => {
    if (!resposta.trim()) return;
    setSalvando(true);
    const { data, error } = await db.from("documento_comentarios")
      .insert({ documento_id: documentoId, parent_id: raiz.id, texto: resposta.trim(), autor_nome: meuNome }).select("*").single();
    setSalvando(false);
    if (error || !data) { toast.error("Não consegui responder"); return; }
    setComentarios((l) => [...l, data as ComentarioDb]);
    setResposta("");
  };
  const resolver = async (c: ComentarioDb) => {
    const { error } = await db.from("documento_comentarios").update({ resolvido: true }).eq("id", c.id);
    if (error) { toast.error("Não consegui resolver"); return; }
    tirarMarcaComentario(editor, c.id);
    setComentarios((l) => l.map((x) => (x.id === c.id ? { ...x, resolvido: true } : x)));
    setAtivo(null);
    toast.success("Comentário resolvido");
  };
  const apagar = async (c: ComentarioDb) => {
    if (!window.confirm(c.parent_id ? "Apagar esta resposta?" : "Apagar este comentário e as respostas?")) return;
    const { error } = await db.from("documento_comentarios").delete().eq("id", c.id);
    if (error) { toast.error("Só quem escreveu (ou o dono do documento) pode apagar"); return; }
    if (!c.parent_id) tirarMarcaComentario(editor, c.id);
    setComentarios((l) => l.filter((x) => x.id !== c.id && x.parent_id !== c.id));
  };

  // ── posição dos cartões: na altura do trecho, na margem à direita da folha (ou por cima da borda, se faltar espaço)
  const [posicoes, setPosicoes] = useState<{ id: string; top: number }[]>([]);
  const [esquerda, setEsquerda] = useState(0);
  useLayoutEffect(() => {
    if (!mesa) return;
    const folha = editor.view.dom.closest<HTMLElement>(".superficie-folha");
    const rm = mesa.getBoundingClientRect();
    const rf = (folha ?? editor.view.dom).getBoundingClientRect();
    const sobra = rm.right - rf.right;
    setEsquerda(sobra >= LARGURA + 24 ? rf.right - rm.left + mesa.scrollLeft + 16 : rm.width - LARGURA - 16 + mesa.scrollLeft);
    const topoDe = (el: Element | null) => (el ? el.getBoundingClientRect().top - rm.top + mesa.scrollTop : null);
    const lista: { id: string; top: number }[] = [];
    const abertos = new Set(comentarios.filter((c) => !c.parent_id && !c.resolvido).map((c) => c.id));
    for (const id of idsComentariosNoTexto(editor)) {
      if (!abertos.has(id)) continue;
      const top = topoDe(editor.view.dom.querySelector(`[data-comentario="${id}"]`));
      if (top !== null) lista.push({ id, top });
    }
    if (novo) {
      try { const c = editor.view.coordsAtPos(novo.de); lista.push({ id: "__novo", top: c.top - rm.top + mesa.scrollTop }); } catch { /* fora do texto */ }
    }
    lista.sort((a, b) => a.top - b.top);
    setPosicoes(lista);
  }, [mesa, editor, comentarios, novo, versao]);
  // Um cartão não fica por cima do outro: empurra para baixo o que encostar (e o aberto fica na altura certa).
  useLayoutEffect(() => {
    const el = camada.current;
    if (!el) return;
    let fim = -Infinity;
    for (const p of posicoes) {
      const card = el.querySelector<HTMLElement>(`[data-cartao="${p.id}"]`);
      if (!card) continue;
      const top = Math.max(p.top, fim + 8);
      card.style.top = `${top}px`;
      fim = top + card.offsetHeight;
    }
  });

  if (!mesa) return null;
  const raiz = (id: string) => comentarios.find((c) => c.id === id);
  const respostas = (id: string) => comentarios.filter((c) => c.parent_id === id);
  const quando = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });

  return createPortal(
    <div ref={camada} className="pointer-events-none absolute left-0 top-0 z-20" style={{ width: 0, height: 0 }} onMouseDown={(e) => e.stopPropagation()}>
      {posicoes.map(({ id, top }) => {
        if (id === "__novo" && novo) {
          return (
            <div key="__novo" data-cartao="__novo" className="pointer-events-auto absolute rounded-lg border bg-popover p-3 shadow-lg" style={{ left: esquerda, top, width: LARGURA }}>
              <p className="mb-1.5 line-clamp-2 border-l-2 border-amber-400 pl-2 text-[11px] text-muted-foreground">{novo.trecho}</p>
              <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Escreva um comentário…"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void salvarNovo(); } if (e.key === "Escape") setNovo(null); }}
                className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary" />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setNovo(null)} className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">Cancelar</button>
                <button type="button" disabled={!texto.trim() || salvando} onClick={() => void salvarNovo()}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                  {salvando && <Loader2 className="h-3 w-3 animate-spin" />}Comentar
                </button>
              </div>
            </div>
          );
        }
        const c = raiz(id);
        if (!c) return null;
        const aberto = ativo === id;
        const resps = respostas(id);
        return (
          <div key={id} data-cartao={id} onClick={() => setAtivo(id)}
            className={cn("pointer-events-auto absolute cursor-pointer rounded-lg border bg-popover p-3 text-sm transition-shadow", aberto ? "shadow-lg ring-1 ring-amber-400/60" : "opacity-90 shadow-sm hover:shadow-md")}
            style={{ left: aberto ? esquerda - 8 : esquerda, top, width: LARGURA }}>
            <Cabecalho nome={c.autor_id === user?.id ? "Você" : c.autor_nome || "Alguém"} quando={quando(c.created_at)}>
              {aberto && (
                <>
                  <button type="button" title="Resolver (some e tira o amarelo)" onClick={(e) => { e.stopPropagation(); void resolver(c); }}
                    className="rounded p-1 text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
                  {(c.autor_id === user?.id) && (
                    <button type="button" title="Apagar" onClick={(e) => { e.stopPropagation(); void apagar(c); }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </>
              )}
            </Cabecalho>
            <p className={cn("mt-1 whitespace-pre-wrap leading-snug", !aberto && "line-clamp-3")}>{c.texto}</p>
            {resps.length > 0 && !aberto && <p className="mt-1 text-[11px] text-muted-foreground">{resps.length} resposta{resps.length > 1 ? "s" : ""}</p>}
            {aberto && resps.map((r) => (
              <div key={r.id} className="mt-2 border-t pt-2">
                <Cabecalho nome={r.autor_id === user?.id ? "Você" : r.autor_nome || "Alguém"} quando={quando(r.created_at)}>
                  {r.autor_id === user?.id && (
                    <button type="button" title="Apagar resposta" onClick={(e) => { e.stopPropagation(); void apagar(r); }}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  )}
                </Cabecalho>
                <p className="mt-0.5 whitespace-pre-wrap leading-snug">{r.texto}</p>
              </div>
            ))}
            {aberto && (
              <div className="mt-2 flex items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={1} placeholder="Responder…"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void responder(c); } }}
                  className="min-h-[32px] flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary" />
              </div>
            )}
          </div>
        );
      })}
    </div>,
    mesa,
  );
}

function Cabecalho({ nome, quando, children }: { nome: string; quando: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{nome.slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[12.5px] font-semibold">{nome}</p>
        <p className="text-[10.5px] text-muted-foreground">{quando}</p>
      </div>
      {children}
    </div>
  );
}

