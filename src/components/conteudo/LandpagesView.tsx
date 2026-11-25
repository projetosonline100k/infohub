import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, ExternalLink, FileText, Loader2, Pause, Play, Plus, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { confirmar } from "@/components/DialogosGlobais";
import { LandpageRender } from "@/components/landpage/LandpageRender";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cn } from "@/lib/utils";
import { ROTULO_BLOCO, blocoNovo, linkDaLandpage, modeloLandpage, type Bloco, type ConfigLandpage, type LandpageResumo, type TipoBloco } from "@/lib/landpage/landpage";

// Páginas → Land page (25/11/2026, Davi): página comprida montada em blocos, com VSL no topo, publicada em /p/<slug>. As tabelas ainda não estão nos tipos gerados.
const db = supabase as unknown as SupabaseClient;
const campo = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm";

export function LandpagesView({ clienteId, sinalCriar }: { clienteId: string; sinalCriar?: number }) {
  const [lista, setLista] = useState<LandpageResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await db.from("landpages").select("id, nome, slug, status, config, publicada, publicado_em, criado_em").eq("cliente_id", clienteId).order("criado_em", { ascending: false });
    setLista((data ?? []) as LandpageResumo[]);
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const criar = useCallback(async () => {
    const { data, error } = await db.from("landpages").insert({ cliente_id: clienteId, nome: "Nova land page", config: modeloLandpage() }).select("id").single();
    if (error || !data) { toast.error("Não consegui criar a land page"); return; }
    await carregar();
    setAberta((data as { id: string }).id);
  }, [clienteId, carregar]);
  const ultimoSinal = useRef(sinalCriar ?? 0);
  useEffect(() => { if (sinalCriar && sinalCriar !== ultimoSinal.current) { ultimoSinal.current = sinalCriar; void criar(); } }, [sinalCriar, criar]);

  const excluir = async (l: LandpageResumo) => {
    if (!(await confirmar(`Excluir a land page "${l.nome}" e as métricas dela? Não dá para desfazer.`, { botao: "Excluir", destrutivo: true }))) return;
    const { error } = await db.from("landpages").delete().eq("id", l.id);
    if (error) { toast.error("Não consegui excluir"); return; }
    void carregar();
  };

  const atual = lista.find((l) => l.id === aberta);
  if (atual) return <EditorLandpage key={atual.id} lp={atual} onVoltar={() => { setAberta(null); void carregar(); }} />;

  return (
    <div className="space-y-2">
      {carregando ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : lista.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma land page ainda. Use o “+” para criar.</div>
        : lista.map((l) => (
          <div key={l.id} className="group flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberta(l.id)}>
              <p className="break-words font-semibold">{l.nome}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("rounded-full px-2 py-0.5 font-medium", l.status === "publicado" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/15")}>{l.status === "publicado" ? "No ar" : l.status === "pausado" ? "Pausada" : "Rascunho"}</span>
                <span>{l.config.blocos?.length ?? 0} blocos</span>
              </p>
            </button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAberta(l.id)}>Editar</Button>
            <button type="button" title="Excluir" onClick={() => void excluir(l)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
    </div>
  );
}

interface Metricas { visitas: number; plays: number; metades: number; fins: number; cliques: number }

function EditorLandpage({ lp, onVoltar }: { lp: LandpageResumo; onVoltar: () => void }) {
  const [nome, setNome] = useState(lp.nome);
  const [config, setConfig] = useState<ConfigLandpage>(lp.config);
  const [status, setStatus] = useState(lp.status);
  const [publicada, setPublicada] = useState<ConfigLandpage | null>(lp.publicada);
  const [aberto, setAberto] = useState<string | null>(lp.config.blocos?.[0]?.id ?? null);
  const [celular, setCelular] = useState(true);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [salvando, setSalvando] = useState(false);
  const primeira = useRef(true);

  // Salva sozinho, meio segundo depois da última mudança.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    setSalvando(true);
    const t = window.setTimeout(async () => {
      const { error } = await db.from("landpages").update({ nome: nome.trim() || "Land page", config }).eq("id", lp.id);
      setSalvando(false);
      if (error) toast.error("Não consegui salvar");
    }, 500);
    return () => window.clearTimeout(t);
  }, [nome, config, lp.id]);

  useEffect(() => {
    void db.from("landpage_eventos").select("tipo").eq("landpage_id", lp.id).limit(50000).then(({ data }) => {
      const c = (t: string) => ((data ?? []) as { tipo: string }[]).filter((e) => e.tipo === t).length;
      setMetricas({ visitas: c("visita"), plays: c("play"), metades: c("metade"), fins: c("fim_video"), cliques: c("cta") });
    });
  }, [lp.id]);

  const mudou = useMemo(() => JSON.stringify(config) !== JSON.stringify(publicada), [config, publicada]);
  const mudarBloco = (id: string, f: (b: Bloco) => void) => setConfig((c) => { const n = structuredClone(c); const b = n.blocos.find((x) => x.id === id); if (b) f(b); return n; });
  const mover = (i: number, d: -1 | 1) => setConfig((c) => { const n = structuredClone(c); const j = i + d; if (j < 0 || j >= n.blocos.length) return c; [n.blocos[i], n.blocos[j]] = [n.blocos[j], n.blocos[i]]; return n; });
  const adicionar = (t: TipoBloco) => { const b = blocoNovo(t); setConfig((c) => ({ ...c, blocos: [...c.blocos, b] })); setAberto(b.id); };
  const remover = (id: string) => setConfig((c) => ({ ...c, blocos: c.blocos.filter((b) => b.id !== id) }));

  const publicar = async () => {
    if (!config.blocos.length) { toast.error("Adicione ao menos um bloco"); return; }
    const { error } = await db.from("landpages").update({ nome: nome.trim() || "Land page", config, publicada: config, status: "publicado" }).eq("id", lp.id);
    if (error) { toast.error("Não consegui publicar"); return; }
    setPublicada(structuredClone(config)); setStatus("publicado");
    toast.success("Land page no ar");
  };
  const pausar = async () => {
    const { error } = await db.from("landpages").update({ status: "pausado" }).eq("id", lp.id);
    if (error) { toast.error("Não consegui pausar"); return; }
    setStatus("pausado");
  };
  const link = linkDaLandpage(lp.slug);
  const taxa = metricas && metricas.visitas ? Math.round((metricas.cliques / metricas.visitas) * 100) : 0;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1" onClick={onVoltar}><ArrowLeft className="h-4 w-4" />Voltar</Button>
        <input className={cn(campo, "max-w-xs font-semibold")} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome da land page" />
        <span className="text-xs text-muted-foreground">{salvando ? "Salvando…" : "Salvo"}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status === "publicado" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/15")}>{status === "publicado" ? "No ar" : status === "pausado" ? "Pausada" : "Rascunho"}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {status === "publicado" && <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado"); }}><Copy className="h-4 w-4" />Copiar link</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void abrirLinkExterno(link)}><ExternalLink className="h-4 w-4" />Abrir</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void pausar()}><Pause className="h-4 w-4" />Pausar</Button>
          </>}
          <Button size="sm" className="gap-1.5" disabled={status === "publicado" && !mudou} onClick={() => void publicar()}>{status === "publicado" ? <Rocket className="h-4 w-4" /> : <Play className="h-4 w-4" />}{status === "publicado" ? (mudou ? "Publicar mudanças" : "Publicada") : "Publicar"}</Button>
        </div>
      </header>

      {metricas && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span><b>{metricas.visitas}</b> visitas</span><span><b>{metricas.plays}</b> deram play</span><span><b>{metricas.metades}</b> viram metade</span><span><b>{metricas.fins}</b> viram até o fim</span><span><b>{metricas.cliques}</b> cliques no botão ({taxa}%)</span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5 text-sm">
            <label className="flex items-center gap-2">Cor do botão<input type="color" value={config.cor || "#16a34a"} onChange={(e) => setConfig((c) => ({ ...c, cor: e.target.value }))} className="h-7 w-9 cursor-pointer rounded border bg-transparent" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={config.escuro !== false} onChange={(e) => setConfig((c) => ({ ...c, escuro: e.target.checked }))} />Fundo escuro</label>
          </div>
          {config.blocos.map((b, i) => (
            <div key={b.id} className="rounded-lg border bg-card">
              <div className="flex items-center gap-1 p-2">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => setAberto(aberto === b.id ? null : b.id)}>{ROTULO_BLOCO[b.tipo]}<span className="ml-2 font-normal text-muted-foreground">{b.titulo || b.texto?.slice(0, 30) || ""}</span></button>
                <button type="button" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" title="Descer" disabled={i === config.blocos.length - 1} onClick={() => mover(i, 1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" title="Remover" onClick={() => remover(b.id)} className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              {aberto === b.id && <div className="space-y-2 border-t p-2.5"><CamposBloco b={b} mudar={(f) => mudarBloco(b.id, f)} /></div>}
            </div>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="w-full gap-1.5"><Plus className="h-4 w-4" />Adicionar bloco</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">{(Object.keys(ROTULO_BLOCO) as TipoBloco[]).map((t) => <DropdownMenuItem key={t} onClick={() => adicionar(t)}>{ROTULO_BLOCO[t]}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex gap-1 text-xs"><button type="button" onClick={() => setCelular(true)} className={cn("rounded-full border px-3 py-1", celular && "bg-primary text-primary-foreground")}>Celular</button><button type="button" onClick={() => setCelular(false)} className={cn("rounded-full border px-3 py-1", !celular && "bg-primary text-primary-foreground")}>Computador</button><span className="ml-2 self-center text-muted-foreground">Prévia do rascunho</span></div>
          <div className="max-h-[78vh] overflow-y-auto rounded-xl border bg-muted/20">
            <div className={cn("mx-auto", celular ? "max-w-[390px]" : "max-w-5xl")}><LandpageRender config={config} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Rotulo({ r, children }: { r: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">{r}</span>{children}</label>;
}

function CamposBloco({ b, mudar }: { b: Bloco; mudar: (f: (b: Bloco) => void) => void }) {
  const t = (k: "titulo" | "subtitulo" | "url" | "video" | "poster" | "botao_texto" | "botao_url" | "de" | "por" | "detalhe" | "garantia" | "nome" | "foto", r: string, ph?: string) => (
    <Rotulo r={r}><input className={campo} placeholder={ph} value={b[k] ?? ""} onChange={(e) => mudar((x) => { x[k] = e.target.value; })} /></Rotulo>
  );
  switch (b.tipo) {
    case "vsl": return <>
      {t("titulo", "Título acima do vídeo")}
      {t("video", "Link do vídeo (mp4, Backblaze, YouTube ou Vimeo)", "https://…")}
      {t("poster", "Capa do vídeo (link da imagem, opcional)", "https://…")}
      {t("botao_texto", "Texto do botão")}{t("botao_url", "Link de compra", "https://pay.kiwify.com.br/…")}
      <Rotulo r="Botão aparece após quantos segundos de vídeo? (0 = já aparece)"><input type="number" min={0} className={campo} value={b.botao_apos ?? 0} onChange={(e) => mudar((x) => { x.botao_apos = Math.max(0, Number(e.target.value) || 0); })} /></Rotulo>
    </>;
    case "titulo": return <>{t("titulo", "Título")}{t("subtitulo", "Subtítulo")}</>;
    case "texto": return <Rotulo r="Texto (linha em branco separa parágrafos)"><Textarea rows={6} className="text-sm" value={b.texto ?? ""} onChange={(e) => mudar((x) => { x.texto = e.target.value; })} /></Rotulo>;
    case "imagem": return t("url", "Link da imagem", "https://…");
    case "lista": return <>{t("titulo", "Título")}<Rotulo r="Itens (um por linha)"><Textarea rows={5} className="text-sm" value={(b.itens ?? []).join("\n")} onChange={(e) => mudar((x) => { x.itens = e.target.value.split("\n"); })} onBlur={() => mudar((x) => { x.itens = (x.itens ?? []).filter((i) => i.trim()); })} /></Rotulo></>;
    case "depoimentos": return <>
      {t("titulo", "Título")}
      {(b.depoimentos ?? []).map((d, i) => (
        <div key={i} className="space-y-1.5 rounded-md border p-2">
          <input className={campo} placeholder="Nome" value={d.nome} onChange={(e) => mudar((x) => { x.depoimentos![i].nome = e.target.value; })} />
          <input className={campo} placeholder="Link da foto (opcional)" value={d.foto ?? ""} onChange={(e) => mudar((x) => { x.depoimentos![i].foto = e.target.value; })} />
          <Textarea rows={3} className="text-sm" placeholder="Depoimento" value={d.texto} onChange={(e) => mudar((x) => { x.depoimentos![i].texto = e.target.value; })} />
          <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => mudar((x) => { x.depoimentos!.splice(i, 1); })}>Remover depoimento</button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => mudar((x) => { (x.depoimentos ??= []).push({ nome: "", texto: "" }); })}><Plus className="h-3.5 w-3.5" />Depoimento</Button>
    </>;
    case "apresentacao": return <>{t("titulo", "Rótulo (ex.: Sua professora)")}{t("nome", "Nome")}{t("foto", "Link da foto", "https://…")}<Rotulo r="Texto"><Textarea rows={4} className="text-sm" value={b.texto ?? ""} onChange={(e) => mudar((x) => { x.texto = e.target.value; })} /></Rotulo></>;
    case "preco": return <>{t("titulo", "Título")}{t("de", "Preço antigo (opcional)", "R$ 297,00")}{t("por", "Preço", "R$ 97,00")}{t("detalhe", "Detalhe do preço")}{t("botao_texto", "Texto do botão")}{t("botao_url", "Link de compra", "https://pay.kiwify.com.br/…")}{t("garantia", "Garantia")}</>;
    case "faq": return <>
      {t("titulo", "Título")}
      {(b.faq ?? []).map((f, i) => (
        <div key={i} className="space-y-1.5 rounded-md border p-2">
          <input className={campo} placeholder="Pergunta" value={f.p} onChange={(e) => mudar((x) => { x.faq![i].p = e.target.value; })} />
          <Textarea rows={3} className="text-sm" placeholder="Resposta" value={f.r} onChange={(e) => mudar((x) => { x.faq![i].r = e.target.value; })} />
          <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => mudar((x) => { x.faq!.splice(i, 1); })}>Remover pergunta</button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => mudar((x) => { (x.faq ??= []).push({ p: "", r: "" }); })}><Plus className="h-3.5 w-3.5" />Pergunta</Button>
    </>;
    case "botao": return <>{t("botao_texto", "Texto do botão")}{t("botao_url", "Link", "https://…")}</>;
  }
}

export { FileText as IconeLandpage };
