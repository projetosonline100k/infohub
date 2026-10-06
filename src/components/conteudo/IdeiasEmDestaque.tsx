import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ArrowRight, CalendarDays, CalendarPlus, Copy, ExternalLink, Eye, FileSpreadsheet, Instagram, Lightbulb, Loader2,
  Link2, Plus, RefreshCw, Tag, Unlink, Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importarPlanilhaReferencias } from "@/lib/conteudo/importarPlanilha";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { sincronizarPlanilhaGoogle, urlCsvDaPlanilha } from "@/lib/conteudo/planilhaGoogle";
import { supabase } from "@/integrations/supabase/client";
import { confirmar, pedirTexto } from "@/components/DialogosGlobais";

const SINCRONIZAR_A_CADA_MS = 5 * 60_000;

export interface IdeiaCard {
  id: string;
  titulo: string;
  descricao: string | null;
  referencia_id?: string | null;
  origem_plataforma?: string | null;
  data_postagem?: string | null;
  created_at?: string;
}

export interface ReferenciaDaIdeia {
  id: string;
  titulo: string;
  link_video: string | null;
  plataforma: string | null;
  criador?: string | null;
  data_publicacao?: string | null;
  visualizacoes?: number | null;
  transcricao?: string | null;
}

const formatarViews = (n: number | null | undefined) => {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("pt-BR");
};

function IconePlataforma({ plataforma, className }: { plataforma?: string | null; className?: string }) {
  if (plataforma === "youtube") return <Youtube className={className} />;
  if (plataforma === "instagram") return <Instagram className={className} />;
  return <Lightbulb className={className} />;
}

// "Ideias em destaque" (topo do pipeline de vídeos verticais): registrar
// ideia, importar a planilha de referências (cada vídeo vira ideia) e, em
// cada ideia, mandar pro roteiro ou agendar no cronograma.
export function IdeiasEmDestaque({ clienteId, ideias, referencias, usadas, onRegistrar, onMoverParaRoteiro, onAgendar, onAbrir, onImportado }: {
  clienteId: string;
  ideias: IdeiaCard[];
  referencias: Map<string, ReferenciaDaIdeia>;
  // Ideias já mandadas pro pipeline → etapa atual do vídeo ("Criando roteiro"…).
  usadas: Map<string, string>;
  onRegistrar: () => void;
  onMoverParaRoteiro: (ideia: IdeiaCard) => void;
  onAgendar: (ideia: IdeiaCard, data: string) => void;
  onAbrir: (ideia: IdeiaCard) => void;
  onImportado: () => void;
}) {
  const [ordem, setOrdem] = useState<"recentes" | "vistas">("recentes");
  const [importando, setImportando] = useState(false);
  const [detalhe, setDetalhe] = useState<IdeiaCard | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const refDe = (ideia: IdeiaCard) => (ideia.referencia_id ? referencias.get(ideia.referencia_id) : undefined);
  // Ideia usada continua no mesmo lugar (só muda de cor).
  const ordenadas = [...ideias].sort((a, b) => ordem === "vistas"
    ? (refDe(b)?.visualizacoes ?? -1) - (refDe(a)?.visualizacoes ?? -1)
    : (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  // ---- Planilha do Google conectada: puxa os vídeos novos sozinha ----
  const [planilhaUrl, setPlanilhaUrl] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const onImportadoRef = useRef(onImportado);
  onImportadoRef.current = onImportado;

  const sincronizar = useCallback(async (url: string, silencioso: boolean) => {
    setSincronizando(true);
    try {
      const { importados } = await sincronizarPlanilhaGoogle(clienteId, url);
      setUltimaSync(new Date());
      if (importados) {
        toast.success(`${importados} ${importados === 1 ? "vídeo novo da planilha virou ideia" : "vídeos novos da planilha viraram ideias"}`);
        onImportadoRef.current();
      } else if (!silencioso) toast.info("Planilha sincronizada — nenhum vídeo novo");
    } catch (erro) {
      if (!silencioso) toast.error("Não foi possível sincronizar a planilha", { description: erro instanceof Error ? erro.message : undefined });
    } finally {
      setSincronizando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    let cancelado = false;
    let intervalo = 0;
    void supabase.from("clientes").select("planilha_referencias_url").eq("id", clienteId).maybeSingle().then(({ data }) => {
      if (cancelado) return;
      const url = data?.planilha_referencias_url ?? null;
      setPlanilhaUrl(url);
      if (!url) return;
      // Ao abrir o Conteúdo e a cada 5 min enquanto ele está aberto.
      void sincronizar(url, true);
      intervalo = window.setInterval(() => void sincronizar(url, true), SINCRONIZAR_A_CADA_MS);
    });
    return () => { cancelado = true; window.clearInterval(intervalo); };
  }, [clienteId, sincronizar]);

  const conectarPlanilha = async () => {
    const link = await pedirTexto("Cole o link da planilha do Google (compartilhada como \"qualquer pessoa com o link pode ver\"):");
    if (!link?.trim()) return;
    if (!urlCsvDaPlanilha(link)) { toast.error("Esse não parece um link de planilha do Google"); return; }
    const { error } = await supabase.from("clientes").update({ planilha_referencias_url: link.trim() }).eq("id", clienteId);
    if (error) { toast.error("Não foi possível salvar o link da planilha"); return; }
    setPlanilhaUrl(link.trim());
    await sincronizar(link.trim(), false);
  };

  const desconectarPlanilha = async () => {
    if (!(await confirmar("Desconectar a planilha? As ideias já importadas continuam aqui.", { botao: "Desconectar" }))) return;
    await supabase.from("clientes").update({ planilha_referencias_url: null }).eq("id", clienteId);
    setPlanilhaUrl(null);
    setUltimaSync(null);
  };

  const importar = async (arquivo: File) => {
    setImportando(true);
    try {
      const { importados, repetidos } = await importarPlanilhaReferencias(clienteId, arquivo);
      if (importados) toast.success(`${importados} ${importados === 1 ? "vídeo virou ideia" : "vídeos viraram ideias"}`, { description: repetidos ? `${repetidos} já estavam no banco e foram pulados.` : undefined });
      else toast.info("Nenhum vídeo novo na planilha", { description: repetidos ? `Os ${repetidos} vídeos já estavam no banco.` : "A planilha está vazia." });
      onImportado();
    } catch (erro) {
      toast.error("Não foi possível importar a planilha", { description: erro instanceof Error ? erro.message : undefined });
    } finally {
      setImportando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  };

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Lightbulb className="h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold leading-tight">Ideias em destaque</h3>
            <p className="text-xs text-muted-foreground">Registre ideias ou importe sua planilha de referências — cada vídeo vira uma ideia.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as "recentes" | "vistas")} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Ordenar ideias">
            <option value="recentes">Mais recentes</option>
            <option value="vistas">Mais visualizações</option>
          </select>
          {planilhaUrl ? (
            <div className="flex h-8 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 pl-2 text-xs text-emerald-600 dark:text-emerald-400">
              <Link2 className="h-3.5 w-3.5" />
              <span title="Puxa os vídeos novos sozinha ao abrir o Conteúdo e a cada 5 minutos">
                Planilha conectada{ultimaSync ? ` · ${format(ultimaSync, "HH:mm")}` : ""}
              </span>
              <button type="button" onClick={() => void sincronizar(planilhaUrl, false)} disabled={sincronizando} className="rounded p-1.5 hover:bg-emerald-500/15" title="Sincronizar agora" aria-label="Sincronizar agora">
                <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? "animate-spin" : ""}`} />
              </button>
              <button type="button" onClick={() => void desconectarPlanilha()} className="rounded p-1.5 hover:bg-emerald-500/15" title="Desconectar planilha" aria-label="Desconectar planilha">
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void conectarPlanilha()} disabled={sincronizando}>
              {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Conectar planilha do Google
            </Button>
          )}
          <input ref={arquivoRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); }} />
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={importando} onClick={() => arquivoRef.current?.click()}>
            {importando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Importar planilha
          </Button>
        </div>
      </header>

      {/* Uma linha só, rolando pro lado — todas as ideias à mostra, sem
          empurrar o pipeline lá pra baixo. */}
      {/* w-0 + min-w-full: a fileira não "estica" a página (que cresce até a
          largura mínima do conteúdo, ver WorkspacePages) — quem rola pro lado
          são só os cartões, dentro da largura da tela. */}
      <div className="flex w-0 min-w-full snap-x gap-3 overflow-x-auto pb-2">
        <button type="button" onClick={onRegistrar}
          className="flex w-36 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-3 text-center transition-colors hover:border-primary hover:bg-primary/10">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary text-primary shadow-[0_0_14px_hsl(var(--primary)/0.4)]"><Plus className="h-5 w-5" /></span>
          <span className="text-sm font-semibold">Registrar ideia</span>
          <span className="text-[11px] leading-snug text-muted-foreground">Capture rapidamente uma ideia de vídeo</span>
        </button>

        {ordenadas.map((ideia) => {
          const ref = refDe(ideia);
          const plataforma = ref?.plataforma ?? ideia.origem_plataforma;
          const views = formatarViews(ref?.visualizacoes);
          const data = ref?.data_publicacao ?? ideia.created_at;
          const etapa = usadas.get(ideia.id);
          return (
            // Cartão vertical (estilo Reel): criador, headline em destaque,
            // visualizações e data. Clique abre os detalhes com a transcrição.
            <article key={ideia.id} className="flex w-[180px] shrink-0 snap-start flex-col gap-2">
              <button type="button" onClick={() => setDetalhe(ideia)}
                className={`group relative flex aspect-[3/4] w-full flex-col overflow-hidden rounded-xl border p-2.5 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5 ${etapa
                  // Já usada: cinza, sinalizando que virou vídeo no pipeline.
                  ? "bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-700 opacity-70 grayscale"
                  : "bg-gradient-to-br from-primary/35 via-zinc-900 to-fuchsia-600/40"}`}>
                {etapa && (
                  <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow">✓ Em produção</span>
                )}
                <div className="flex items-start justify-between gap-1">
                  <span className="max-w-[120px] truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
                    {ref?.criador ? ref.criador.replace(/\s*\|.*$/, "") : plataforma === "instagram" ? "Instagram" : "Ideia"}
                  </span>
                  <IconePlataforma plataforma={plataforma} className="h-4 w-4 shrink-0 opacity-80" />
                </div>
                <div className="flex flex-1 items-center">
                  <span className="line-clamp-5 block rounded-md bg-black/45 px-1.5 py-1 text-[13px] font-bold leading-snug">{ideia.titulo}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{views ?? "—"}</span>
                  {data && <span className="opacity-80">{format(new Date(`${data.slice(0, 10)}T12:00:00`), "dd/MM/yyyy")}</span>}
                </div>
              </button>
              <div className="flex gap-1.5">
                {etapa ? (
                  <span className="flex h-7 flex-1 items-center justify-center truncate rounded-md bg-emerald-500/15 px-2 text-[11px] font-medium text-emerald-500" title={`Vídeo em: ${etapa}`}>{etapa}</span>
                ) : (
                  <Button size="sm" className="h-7 flex-1 gap-1 px-2 text-[11px] font-semibold" onClick={() => onMoverParaRoteiro(ideia)}>Roteiro<ArrowRight className="h-3 w-3" /></Button>
                )}
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setDetalhe(ideia)} title="Ver detalhes do post">
                  <Eye className="h-3 w-3" />Ver post
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Detalhes da ideia: "capa" + métricas + transcrição com rolagem. */}
      <Dialog open={!!detalhe} onOpenChange={(aberto) => { if (!aberto) setDetalhe(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {detalhe && (() => {
            const ref = refDe(detalhe);
            const plataforma = ref?.plataforma ?? detalhe.origem_plataforma;
            return (
              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div className="flex aspect-[9/16] flex-col justify-center rounded-xl bg-gradient-to-br from-primary/35 via-zinc-900 to-fuchsia-600/40 p-4 text-white">
                  <IconePlataforma plataforma={plataforma} className="mb-3 h-6 w-6 opacity-80" />
                  <p className="text-lg font-bold leading-snug">{detalhe.titulo}</p>
                </div>
                <div className="min-w-0 space-y-3">
                  <DialogHeader>
                    <DialogTitle className="pr-6 text-base leading-snug">{detalhe.titulo}</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm">
                    <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-blue-500" /><div><p className="text-[11px] text-muted-foreground">Visualizações</p><p className="font-medium">{ref?.visualizacoes != null ? ref.visualizacoes.toLocaleString("pt-BR") : "—"}</p></div></div>
                    <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-fuchsia-500" /><div><p className="text-[11px] text-muted-foreground">Data do post</p><p className="font-medium">{ref?.data_publicacao ? format(new Date(`${ref.data_publicacao}T12:00:00`), "dd/MM/yyyy") : "—"}</p></div></div>
                    <div className="col-span-2 flex items-center gap-2"><Tag className="h-4 w-4 text-amber-500" /><div className="min-w-0"><p className="text-[11px] text-muted-foreground">Criador</p><p className="truncate font-medium">{ref?.criador ?? "—"}</p></div></div>
                  </div>
                  <div className="space-y-2 rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{ref?.transcricao ? "Transcrição" : "Descrição / notas"}</p>
                      {ref?.link_video && (
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void abrirLinkExterno(ref.link_video!)}>
                          <ExternalLink className="h-3.5 w-3.5" />Abrir no {plataforma === "youtube" ? "YouTube" : plataforma === "tiktok" ? "TikTok" : "Instagram"}
                        </Button>
                      )}
                    </div>
                    {/* Altura fixa com rolagem: transcrição longa não estica a janela. */}
                    <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2.5 text-xs leading-relaxed">
                      {ref?.transcricao || detalhe.descricao || "Sem transcrição ou notas."}
                    </div>
                    {(ref?.transcricao || detalhe.descricao) && (
                      <Button size="sm" variant="secondary" className="h-8 w-full gap-1.5" onClick={() => { void navigator.clipboard.writeText(ref?.transcricao || detalhe.descricao || ""); toast.success("Copiado"); }}>
                        <Copy className="h-3.5 w-3.5" />Copiar {ref?.transcricao ? "transcrição" : "notas"}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {usadas.get(detalhe.id) ? (
                      <span className="flex h-8 flex-1 items-center justify-center rounded-md bg-emerald-500/15 px-3 text-xs font-medium text-emerald-500">✓ Em produção · {usadas.get(detalhe.id)}</span>
                    ) : (
                      <Button size="sm" className="h-8 flex-1 gap-1.5 font-semibold" onClick={() => { onMoverParaRoteiro(detalhe); setDetalhe(null); }}>Mover para roteiro<ArrowRight className="h-3.5 w-3.5" /></Button>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 flex-1 gap-1.5 border-primary/50 text-primary">
                          <CalendarPlus className="h-3.5 w-3.5" />
                          {detalhe.data_postagem ? `No cronograma: ${format(new Date(`${detalhe.data_postagem.slice(0, 10)}T12:00:00`), "dd/MM")}` : "Adicionar ao cronograma"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-60 space-y-2 p-3">
                        <p className="text-xs font-medium">Data de postagem</p>
                        <Input type="date" defaultValue={detalhe.data_postagem?.slice(0, 10) ?? ""} onChange={(e) => { if (e.target.value) { onAgendar(detalhe, e.target.value); setDetalhe({ ...detalhe, data_postagem: e.target.value }); } }} />
                      </PopoverContent>
                    </Popover>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { onAbrir(detalhe); setDetalhe(null); }}>Editar ideia</Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </section>
  );
}
