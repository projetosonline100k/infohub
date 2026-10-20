import { useCallback, useEffect, useRef, useState } from "react";
import { marcarCarrosselDaConversa } from "@/hooks/useEstadoConversas";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Loader2, MessageSquareWarning, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cn } from "@/lib/utils";
import {
  STATUS_CARROSSEL, chaveRascunho, desfazerExclusao, lerRascunho, rascunhoTemMudanca, excluirPagina, historicoVazio, montarPedidoAjuste, montarPrevia, paginaVisivel, paginasEditadas,
  opcoesDeTitulo, partesDoTitulo, podeExcluir, refazerExclusao,
  type CarrosselResumo, type SlideCarrossel,
} from "@/lib/empresa/carrossel";
import { aprovarCarrosseis } from "@/lib/empresa/aprovarCarrossel";
import { PreviaPagina } from "./PreviaPagina";
import { ConversaEntrega } from "./ConversaEntrega";

// Revisão de um carrossel do Roy: ver as páginas e a legenda, corrigir
// texto, pedir ajuste ou aprovar. Aprovado, vira tarefa da Dalila programar.
// Conversa com o Roy ao lado (16/10, Davi: "seria melhor mostrar o chat, igual quando é
// a edição e o quiz"): fica na tarefa dele; ajuste claro ele pede sozinho (roy.py pedir-ajuste)
// e a nova versão aparece aqui (onRecarregar).
export function RevisaoCarrossel({ clienteId, carrossel, onFechar, onRecarregar }: {
  clienteId: string;
  carrossel: CarrosselResumo | null;
  onFechar: () => void;
  onRecarregar?: () => void;
}) {
  const [royId, setRoyId] = useState<string | null>(null);
  useEffect(() => {
    void supabase.from("membros").select("id").eq("cliente_id", clienteId).eq("eh_ia", true).ilike("nome", "roy").limit(1)
      .then(({ data }) => setRoyId(data?.[0]?.id ?? null));
  }, [clienteId]);
  const [atual, setAtual] = useState(0);
  const [slides, setSlides] = useState<SlideCarrossel[]>([]);
  const [legenda, setLegenda] = useState("");
  const [pedido, setPedido] = useState("");
  const [editando, setEditando] = useState(false);
  // Páginas excluídas (1 = primeira) somem da tela; ⌘Z desfaz, ⌘⇧Z refaz.
  const [historico, setHistorico] = useState(historicoVazio);
  const excluidas = historico.excluidas;
  const [salvando, setSalvando] = useState<"aprovar" | "ajuste" | null>(null);
  // Rascunho: o que o Davi mexeu fica salvo no app (por carrossel e versão) e volta ao reabrir.
  const [restaurado, setRestaurado] = useState(false);
  const chaveCarregada = useRef<string | null>(null);

  useEffect(() => {
    setAtual(0);
    setEditando(false);
    chaveCarregada.current = null;
    if (!carrossel) return;
    const chave = chaveRascunho(carrossel.id, carrossel.versao);
    let salvo = null;
    try { salvo = lerRascunho(localStorage.getItem(chave), carrossel); } catch { /* sem storage */ }
    setSlides(salvo?.slides ?? carrossel.slides);
    setLegenda(salvo?.legenda ?? carrossel.legenda ?? "");
    setPedido(salvo?.pedido ?? "");
    setHistorico(salvo?.historico ?? historicoVazio());
    setRestaurado(!!salvo && rascunhoTemMudanca(carrossel, salvo));
    chaveCarregada.current = chave;
  }, [carrossel]);

  // Salva a cada mudança (e apaga quando volta a ficar igual ao que o Roy entregou).
  useEffect(() => {
    const chave = chaveCarregada.current;
    if (!carrossel || !chave || chave !== chaveRascunho(carrossel.id, carrossel.versao)) return;
    const r = { slides, legenda, pedido, historico };
    try {
      if (rascunhoTemMudanca(carrossel, r)) localStorage.setItem(chave, JSON.stringify(r));
      else localStorage.removeItem(chave);
    } catch { /* sem storage: segue sem rascunho */ }
  }, [carrossel, slides, legenda, pedido, historico]);

  const apagarRascunho = () => {
    if (!carrossel) return;
    try { localStorage.removeItem(chaveRascunho(carrossel.id, carrossel.versao)); } catch { /* sem storage */ }
  };
  const descartarRascunho = () => {
    if (!carrossel) return;
    apagarRascunho();
    setSlides(carrossel.slides);
    setLegenda(carrossel.legenda ?? "");
    setPedido("");
    setHistorico(historicoVazio());
    setRestaurado(false);
    setAtual(0);
  };

  const total = carrossel?.paginas.length ?? 0;
  const dois = (n: number) => String(n).padStart(2, "0");

  const desfazer = useCallback(() => {
    const r = desfazerExclusao(historico);
    if (r.pagina == null) return;
    setHistorico(r.h);
    setAtual(r.pagina - 1); // mostra a página que voltou
    toast(`Página ${dois(r.pagina)} voltou`);
  }, [historico]);
  const refazer = useCallback(() => {
    const r = refazerExclusao(historico);
    if (r.pagina == null) return;
    setHistorico(r.h);
    setAtual((n) => paginaVisivel(n, total, r.h.excluidas));
    toast(`Página ${dois(r.pagina)} excluída de novo`);
  }, [historico, total]);
  // O toast "Desfazer" chama a versão mais nova (o histórico muda depois).
  const desfazerRef = useRef(desfazer);
  desfazerRef.current = desfazer;

  // Setas passam as páginas (pulando as excluídas); ⌘Z / ⌘⇧Z desfazem e refazem a exclusão.
  useEffect(() => {
    if (!carrossel) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return; // nos campos, ⌘Z é do texto
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer(); else desfazer();
        return;
      }
      if (e.key === "ArrowRight") setAtual((n) => (n + 1 < total ? paginaVisivel(n + 1, total, excluidas, 1) : n));
      if (e.key === "ArrowLeft") setAtual((n) => (n > 0 ? paginaVisivel(n - 1, total, excluidas, -1) : n));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [carrossel, total, excluidas, desfazer, refazer]);

  if (!carrossel) return null;
  const c = carrossel;
  const conversa = c.atividade_roy_id && royId ? { tarefaId: c.atividade_roy_id, membroId: royId } : null;
  const editadas = paginasEditadas(c.slides, slides);
  const legendaMudou = (c.legenda ?? "").trim() !== legenda.trim();
  // "Com problema" (a revisão automática barrou a versão nova): as páginas que já existem
  // continuam valendo, então dá pra editar, pedir ajuste ou aprovar do mesmo jeito.
  const podeRevisar = c.status === "revisar" || (c.status === "erro" && c.paginas.length > 0);
  const pagina = atual + 1;
  const visiveis = c.paginas.map((u, i) => ({ u, i })).filter(({ i }) => !excluidas.includes(i + 1));
  const posicao = visiveis.findIndex(({ i }) => i === atual) + 1; // "3/7" já sem as excluídas
  const bloqueioExcluir = podeExcluir(pagina, total, excluidas);
  const excluir = () => {
    if (bloqueioExcluir) { toast.error(bloqueioExcluir); return; }
    const novo = excluirPagina(historico, pagina);
    setHistorico(novo);
    setAtual(paginaVisivel(atual, total, novo.excluidas));
    toast(`Página ${dois(pagina)} excluída`, {
      description: "⌘Z desfaz · ⌘⇧Z refaz",
      action: { label: "Desfazer", onClick: () => desfazerRef.current() },
    });
  };
  // Página com texto editado: desenha ao vivo pelo molde do Roy (sem esperar o PNG novo).
  const molde = c.modelos?.[atual];
  const editadaAgora = editadas.includes(pagina);
  const previa = molde && editadaAgora && slides[atual] ? montarPrevia(molde, slides[atual].titulo, slides[atual].texto) : null;
  const anterior = visiveis[posicao - 2]?.i;
  const proxima = visiveis[posicao]?.i;

  const pedirAjuste = async () => {
    const texto = montarPedidoAjuste(pedido, editadas, legendaMudou, excluidas);
    if (!texto) { toast.error("Escreva o que o Roy deve mudar (ou edite os textos)."); return; }
    setSalvando("ajuste");
    const { error } = await supabase.from("carrosseis").update({
      // Páginas excluídas saem da lista; o Roy remonta e renumera (o "pagina" antigo diz de onde cada uma veio).
      status: "ajuste", feedback: texto, slides: slides.filter((_, i) => !excluidas.includes(i + 1)) as unknown as never,
      legenda, aprovar_apos_ajuste: false, atualizado_em: new Date().toISOString(),
    }).eq("id", c.id);
    setSalvando(null);
    if (error) { toast.error("Não consegui enviar o pedido de ajuste"); return; }
    apagarRascunho();
    toast.success("Pedido enviado ao Roy");
    onFechar();
  };

  const aprovar = async () => {
    if (pedido.trim()) {
      toast.error("Você escreveu um pedido para o Roy: clique em \"Pedir ajuste\" para ver a nova versão antes de aprovar.");
      return;
    }
    if (editadas.length || legendaMudou || excluidas.length) {
      // Mexeu só no que é mecânico (páginas excluídas, texto, legenda): o Roy remonta
      // (a numeração muda) e, passando na revisão automática, já aprova e manda pra Dalila.
      setSalvando("aprovar");
      const { error } = await supabase.from("carrosseis").update({
        status: "ajuste", feedback: montarPedidoAjuste("", editadas, legendaMudou, excluidas),
        slides: slides.filter((_, i) => !excluidas.includes(i + 1)) as unknown as never,
        legenda, aprovar_apos_ajuste: true, atualizado_em: new Date().toISOString(),
      }).eq("id", c.id);
      setSalvando(null);
      if (error) { toast.error("Não consegui aprovar"); return; }
      apagarRascunho();
      toast.success("Aprovado! O Roy remonta com as suas mudanças e já manda para a Dalila programar.");
      onFechar();
      return;
    }
    setSalvando("aprovar");
    try {
      const { programador } = await aprovarCarrosseis(clienteId, [c]);
      apagarRascunho();
      toast.success(programador ? `Aprovado. Foi para a fila da ${programador} programar.` : "Aprovado. (Não achei a Dalila no projeto para criar a tarefa.)");
      onFechar();
    } catch {
      toast.error("Não consegui aprovar");
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className={cn("max-h-[94vh]", conversa ? "flex max-w-[1400px] flex-col gap-4 overflow-y-auto lg:flex-row lg:overflow-hidden" : "max-w-6xl overflow-y-auto")}>
        <div className={cn("grid min-w-0 flex-1 gap-4", conversa && "lg:overflow-y-auto lg:pr-1")}>
        <DialogHeader>
          <DialogTitle>{c.numero ? `${String(c.numero).padStart(3, "0")} · ` : ""}{c.tema}</DialogTitle>
          <DialogDescription>
            Carrossel do Roy · {STATUS_CARROSSEL[c.status] ?? c.status} · versão {c.versao}
            {c.fonte_permalink && (
              <button type="button" onClick={() => abrirLinkExterno(c.fonte_permalink!)} className="ml-2 inline-flex items-center gap-1 underline-offset-2 hover:underline">
                reel de origem <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </DialogDescription>
        </DialogHeader>

        {restaurado && podeRevisar && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">
            <span className="min-w-0 flex-1">Rascunho restaurado: o que você tinha mexido antes voltou.</span>
            <Button size="sm" variant="ghost" className="h-7" onClick={descartarRascunho}>Descartar rascunho</Button>
          </div>
        )}
        {c.status === "revisar" && c.mensagem && (
          <p className="rounded-md border bg-muted/40 p-2.5 text-sm">{c.mensagem}</p>
        )}
        {c.status === "erro" && (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600 dark:text-rose-400">{c.mensagem}</p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Páginas */}
          <div>
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[460px] overflow-hidden rounded-lg border bg-muted">
              {previa ? (
                <>
                  <PreviaPagina html={previa} className="h-full w-full" />
                  <span className="absolute left-2 top-2 rounded bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white">Editado · prévia</span>
                </>
              ) : c.paginas[atual] && <img src={c.paginas[atual]} alt={`Página ${posicao}`} className="h-full w-full object-contain" />}
              <button type="button" disabled={anterior == null} onClick={() => anterior != null && setAtual(anterior)} aria-label="Página anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white disabled:opacity-0">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" disabled={proxima == null} onClick={() => proxima != null && setAtual(proxima)} aria-label="Próxima página"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white disabled:opacity-0">
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{posicao}/{visiveis.length}</span>
            </div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {visiveis.map(({ u, i }, k) => (
                <button key={u} type="button" onClick={() => setAtual(i)}
                  className={cn("w-14 shrink-0 overflow-hidden rounded border-2", i === atual ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}>
                  <img src={u} alt={`Miniatura ${k + 1}`} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>

          {/* Texto, legenda e decisão */}
          <div className="flex min-w-0 flex-col gap-4">
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Página {posicao}</h3>
                {podeRevisar && (
                  <span className="flex items-center gap-3">
                    <button type="button" onClick={() => setEditando(!editando)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3 w-3" /> {editando ? "Fechar edição" : "Editar texto"}
                    </button>
                    <button type="button" onClick={excluir} title={bloqueioExcluir ?? "Excluir esta página (⌘Z desfaz)"}
                      className={cn("flex items-center gap-1 text-xs", bloqueioExcluir ? "cursor-not-allowed text-muted-foreground/50" : "text-rose-600 hover:text-rose-700")}>
                      <Trash2 className="h-3 w-3" /> Excluir página
                    </button>
                  </span>
                )}
              </div>
              {slides[atual] && (editando ? (
                <div className="space-y-2">
                  <Input value={slides[atual].titulo} aria-label="Título da página"
                    onChange={(e) => setSlides(slides.map((s, i) => (i === atual ? { ...s, titulo: e.target.value } : s)))} />
                  <Textarea value={slides[atual].texto} rows={3} aria-label="Texto da página"
                    onChange={(e) => setSlides(slides.map((s, i) => (i === atual ? { ...s, texto: e.target.value } : s)))} />
                  <p className="text-[11px] text-muted-foreground">Palavras entre *asteriscos* ficam em vermelho.</p>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="font-bold uppercase leading-tight">
                    {partesDoTitulo(slides[atual].titulo).map((p, i) => <span key={i} className={p.destaque ? "text-red-700 dark:text-red-400" : undefined}>{p.texto}</span>)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{slides[atual].texto}</p>
                </div>
              ))}
              {podeRevisar && slides[atual] && opcoesDeTitulo(c.slides[atual], slides[atual].titulo).length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Outras opções de título (clique pra trocar):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {opcoesDeTitulo(c.slides[atual], slides[atual].titulo).map((op) => (
                      <button key={op} type="button" onClick={() => setSlides(slides.map((s, i) => (i === atual ? { ...s, titulo: op } : s)))}
                        className="rounded-md border bg-background px-2 py-1 text-left text-xs font-semibold uppercase leading-tight hover:border-primary/50 hover:bg-muted">
                        {partesDoTitulo(op).map((p, i) => <span key={i} className={p.destaque ? "text-red-700 dark:text-red-400" : undefined}>{p.texto}</span>)}
                        {op === c.slides[atual].titulo && <span className="ml-1 font-normal normal-case text-muted-foreground">(original)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {excluidas.length > 0 && (
                <p className="mt-1 text-xs text-rose-600">
                  {excluidas.length === 1 ? "1 página excluída" : `${excluidas.length} páginas excluídas`} (⌘Z desfaz). Clique em "Pedir ajuste" para o Roy remontar o carrossel.
                </p>
              )}
              {editadas.length > 0 && <p className="mt-1 text-xs text-amber-600">Você editou {editadas.length === 1 ? "a página" : "as páginas"} {editadas.join(", ")}.</p>}
            </section>

            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Legenda</h3>
              <Textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={8} readOnly={!podeRevisar} className="text-sm" aria-label="Legenda" />
            </section>

            {c.feedback && c.status !== "ajuste" && (
              <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground"><b>Último pedido de ajuste:</b> {c.feedback}</p>
            )}

            {podeRevisar ? (
              <section className="space-y-2 rounded-lg border p-3">
                <Textarea value={pedido} onChange={(e) => setPedido(e.target.value)} rows={2}
                  placeholder="O que o Roy deve mudar? (ex.: trocar a escultura da capa, título mais curto na página 3)" aria-label="Pedido de ajuste" />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={pedirAjuste} disabled={!!salvando}>
                    {salvando === "ajuste" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageSquareWarning className="mr-1.5 h-4 w-4" />}
                    Pedir ajuste
                  </Button>
                  <Button onClick={aprovar} disabled={!!salvando} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    {salvando === "aprovar" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                    Aprovar
                  </Button>
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">{STATUS_CARROSSEL[c.status] ?? c.status}.</p>
            )}
          </div>
        </div>
        </div>
        {conversa && (
          <aside className="h-[460px] shrink-0 lg:h-auto lg:w-[340px]">
            <ConversaEntrega key={conversa.tarefaId} clienteId={clienteId} tarefaId={conversa.tarefaId} membroId={conversa.membroId}
              nome="Roy" onDocumentoMudou={() => onRecarregar?.()}
              onEnviou={() => marcarCarrosselDaConversa(conversa.tarefaId, c.id)} />
          </aside>
        )}
      </DialogContent>
    </Dialog>
  );
}
