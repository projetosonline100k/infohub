import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Eye, Instagram, Loader2, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { lerAnalise, montarBlocoReferencia, montarCarregando, proximoNumeroHeadline } from "@/lib/conteudo/blocoReferencia";
import { TEXTO_CARREGANDO } from "@/lib/tiptapHeadlineTitulo";

// ⌘H no documento (18/10/2026, Davi): "mostra os vídeos que já estão salvos no banco; ao
// selecionar, aparece em abre e fecha — link, transcrição, conteúdo notável, por que viralizou —
// e já marca que aquele vídeo foi usado". No Mac, o Claude (rápido) escreve a headline em
// português, o conteúdo notável e o porquê; na web entram só link e transcrição.
const db = supabase as unknown as SupabaseClient;

// Alguns vídeos chegaram com o link no lugar do título.
function tituloDe(r: { titulo: string; titulo_pt: string | null; criador: string | null }) {
  const t = (r.titulo_pt || r.titulo || "").trim();
  return /^https?:\/\//i.test(t) || !t ? `Vídeo de ${r.criador?.split(" (")[0] || "referência"}` : t;
}

interface Referencia {
  id: string; titulo: string; titulo_pt: string | null; link_video: string | null; criador: string | null; thumbnail_url: string | null;
  visualizacoes: number | null; transcricao: string | null; transcricao_pt: string | null; usado_em: string | null;
}

const PEDIDO = (r: Referencia, transcricao: string) => `Você analisa um vídeo curto viral (Reels) que vai servir de referência para um roteiro novo.
Criador: ${r.criador ?? "?"} · ${r.visualizacoes ? `${r.visualizacoes.toLocaleString("pt-BR")} visualizações` : "visualizações desconhecidas"}
Título: ${r.titulo_pt || r.titulo}
Transcrição:
"""
${transcricao.slice(0, 6000)}
"""
Responda SOMENTE com um JSON:
{"headline": "a frase de abertura (gancho) do vídeo, em português do Brasil, natural",
 "notavel": ["3 a 5 fatos, dados, estudos ou exemplos marcantes e verdadeiros sobre o tema, que enriqueceriam um roteiro novo (cite a fonte entre parênteses quando souber; se não tiver certeza, escreva (conferir))"],
 "porque": ["3 a 5 motivos objetivos de o vídeo ter viralizado: gancho, curiosidade, emoção, estrutura, ritmo, CTA, identificação…"]}`;

export function BancoViraisDoc({ editor, clienteId }: { editor: Editor; clienteId: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Referencia[]>([]);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<Referencia | null>(null);   // ficha do vídeo antes de usar
  const [todos, setTodos] = useState(false);   // false = só os não usados

  // ⌘H (o menu do Mac não usa mais essa tecla para ocultar o app).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "h") return;
      e.preventDefault();
      e.stopPropagation();
      setAberto(true);
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    let q = db.from("videos_referencia")
      .select("id, titulo, titulo_pt, link_video, criador, thumbnail_url, visualizacoes, transcricao, transcricao_pt, usado_em")
      .order("visualizacoes", { ascending: false, nullsFirst: false }).limit(300);
    if (clienteId) q = q.eq("cliente_id", clienteId);
    void q.then(({ data, error }) => {
      if (error) { toast.error("Não consegui carregar o banco de virais"); return; }
      // Os ainda não usados primeiro.
      setLista(((data ?? []) as Referencia[]).sort((a, b) => Number(!!a.usado_em) - Number(!!b.usado_em)));
    });
  }, [aberto, clienteId]);

  // 18/10 (Davi): "em vez de ficar numa página carregando, poderia ficar dentro do docs, com a
  // bolinha embaixo da headline". A headline entra na hora, com "Preparando +Info…" girando
  // embaixo; quando o Claude responde, o bloco completo entra no lugar dos dois.
  const escolher = useCallback(async (r: Referencia) => {
    const transcricao = (r.transcricao_pt || r.transcricao || "").trim();
    const numero = proximoNumeroHeadline(editor.getHTML());
    const titulo = tituloDe(r);
    editor.chain().focus().insertContent(montarCarregando(numero, titulo)).run();
    setAberto(false);
    setAberta(null);
    void db.from("videos_referencia").update({ usado_em: new Date().toISOString() }).eq("id", r.id).then(({ error }) => {
      if (error) toast.error("Não consegui marcar o vídeo como usado");
    });
    let analise: ReturnType<typeof lerAnalise> = { notavel: [], porque: [] };
    if (isDesktop() && transcricao) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        analise = lerAnalise(await invoke<string>("claude_rapido", { pedido: PEDIDO(r, transcricao), modelo: "sonnet" }));
      } catch {
        toast("Não consegui gerar o conteúdo notável agora; entrou o resto.");
      }
    }
    if (editor.isDestroyed) return;   // saiu do documento no meio: fica o "Preparando" (dá para apagar)
    const html = montarBlocoReferencia({
      numero, headline: analise.headline || titulo,
      link: r.link_video, transcricao: transcricao || null, notavel: analise.notavel, porque: analise.porque,
    });
    // Acha a headline Nº {numero} seguida do "Preparando +Info" e troca os dois pelo bloco.
    const doc = editor.state.doc;
    const prefixo = `Headline ${String(numero).padStart(2, "0")}:`;
    let alvo: { de: number; ate: number } | null = null;
    let anterior: { pos: number; no: typeof doc.firstChild } | null = null;
    doc.forEach((no, pos) => {
      if (!alvo && no.type.name === "paragraph" && no.textContent.startsWith(TEXTO_CARREGANDO)
        && anterior?.no?.type.name === "heading" && anterior.no.textContent.startsWith(prefixo)) {
        alvo = { de: anterior.pos, ate: pos + no.nodeSize };
      }
      anterior = { pos, no };
    });
    // (o TS não enxerga a atribuição dentro do forEach)
    const achado = alvo as { de: number; ate: number } | null;
    if (achado) editor.chain().insertContentAt({ from: achado.de, to: achado.ate }, html).run();
    else editor.chain().focus("end").insertContent(html).run();   // apagaram o "Preparando": entra no fim
  }, [editor]);

  const fmt = (n: number | null) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n));
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter((r) => (todos || !r.usado_em)
    && (!termo || `${r.titulo_pt ?? ""} ${r.titulo} ${r.criador ?? ""}`.toLowerCase().includes(termo)));

  return (
    <Dialog open={aberto} onOpenChange={(a) => { setAberto(a); if (!a) setAberta(null); }}>
      <DialogContent className="max-w-5xl gap-3 p-5">
        <DialogHeader>
          <DialogTitle>Banco de vídeos virais</DialogTitle>
          <DialogDescription>Clique num vídeo para ver os detalhes; "Usar este vídeo" coloca no documento o link, a transcrição, o conteúdo notável e por que viralizou. (⌘H)</DialogDescription>
        </DialogHeader>
        {aberta ? (
          // Ficha do vídeo (18/10: "queria abrir o vídeo e ver melhor as informações" antes de usar).
          <div className="flex gap-5">
            <button type="button" title="Assistir no Instagram" onClick={() => aberta.link_video && void abrirLinkExterno(aberta.link_video)}
              className="group relative aspect-[9/16] w-56 shrink-0 overflow-hidden rounded-xl bg-muted">
              {aberta.thumbnail_url
                ? <img src={aberta.thumbnail_url} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-500/25 to-purple-500/25"><Instagram className="h-8 w-8 text-muted-foreground" /></div>}
              {aberta.link_video && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition group-hover:scale-110"><Play className="ml-0.5 h-5 w-5" /></span>
                </span>
              )}
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <p className="text-lg font-bold leading-snug">{tituloDe(aberta)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  {aberta.criador && <span>{aberta.criador}</span>}
                  {aberta.visualizacoes ? <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{fmt(aberta.visualizacoes)} views</span> : null}
                  {aberta.usado_em && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">já usado</span>}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-3" style={{ maxHeight: 300 }}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Transcrição</p>
                <p className="whitespace-pre-line text-sm leading-relaxed">{(aberta.transcricao_pt || aberta.transcricao || "").trim() || "Sem transcrição ainda."}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setAberta(null)}>← Voltar</Button>
                {aberta.link_video && <Button variant="outline" size="sm" className="gap-1" onClick={() => void abrirLinkExterno(aberta.link_video!)}><Play className="h-3.5 w-3.5" />Assistir no Instagram</Button>}
                <span className="flex-1" />
                <Button size="sm" onClick={() => { const r = aberta; setAberta(null); void escolher(r); }}>Usar este vídeo</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Ao usar, entram no documento o link, a transcrição, o conteúdo notável e por que viralizou, e o vídeo fica marcado como usado.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou criador…" className="h-9 pl-8" />
              </div>
              <div className="inline-flex rounded-lg border p-0.5 text-xs font-medium">
                {([false, true] as const).map((t) => (
                  <button key={String(t)} type="button" onClick={() => setTodos(t)}
                    className={cn("rounded-md px-3 py-1.5", todos === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                    {t ? `Todos (${lista.length})` : `Não usados (${lista.filter((r) => !r.usado_em).length})`}
                  </button>
                ))}
              </div>
            </div>
            {/* Fileira horizontal (como "Vídeos que performaram"); a rodinha do mouse rola para o lado. */}
            <div className="flex w-full gap-3 overflow-x-auto overscroll-x-contain pb-3"
              onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
              {visiveis.length === 0 && <p className="py-10 text-sm text-muted-foreground">Nenhum vídeo{termo ? " com essa busca" : todos ? " no banco" : " sem usar"}.</p>}
              {visiveis.map((r) => (
                <button key={r.id} type="button" onClick={() => setAberta(r)}
                  className="group w-40 shrink-0 text-left focus-visible:outline-none">
                  <div className={cn("relative aspect-[9/16] overflow-hidden rounded-xl bg-muted ring-offset-2 ring-offset-background transition group-hover:ring-2 group-hover:ring-primary group-focus-visible:ring-2 group-focus-visible:ring-primary",
                    r.usado_em && "opacity-60")}>
                    {r.thumbnail_url ? (
                      <img src={r.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-500/25 to-purple-500/25">
                        <Instagram className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 bg-gradient-to-b from-black/60 to-transparent p-2">
                      {r.visualizacoes ? <span className="flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10.5px] font-semibold text-white"><Eye className="h-3 w-3" />{fmt(r.visualizacoes)}</span> : <span />}
                      {r.usado_em && <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900">usado</span>}
                    </div>
                    {!(r.transcricao || r.transcricao_pt) && (
                      <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white">sem transcrição</span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] font-medium leading-snug">{tituloDe(r)}</p>
                  {r.criador && <p className="truncate text-[11px] text-muted-foreground">{r.criador}</p>}
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
