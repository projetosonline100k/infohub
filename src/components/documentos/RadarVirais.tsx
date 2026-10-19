import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Eye, Instagram, Link2, Loader2, Play, Plus, Search, Sparkles, Trash2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { salvarCapa } from "@/lib/creator/transcricaoStore";
import { lerAnalise, lerJson, montarBlocoReferencia, proximoNumeroHeadline } from "@/lib/conteudo/blocoReferencia";

// Radar de virais (18/10/2026, Davi: "um modo chamado Radar de virais: buscar vídeos virais no
// YouTube/Instagram/TikTok, gerar headlines com base nas estruturas que vamos cadastrar e outras
// coisas mais"). Fica ao lado do Banco, na mesma janela do ⌘H. Tudo pesado roda no Mac:
// - YouTube: busca direta pelo yt-dlp (views reais, segundos) — creator_transcrever modo buscar_youtube;
// - Instagram/TikTok: o Claude pesquisa na internet (claude_pesquisa, ~30 s) e o app confere cada
//   link pelo yt-dlp (capa e views reais, modo capa);
// - salvar no banco já transcreve em segundo plano (modo preciso);
// - headlines: o Claude escreve seguindo as estruturas do projeto (clientes.estruturas_headline);
// - analisar link: transcreve um vídeo colado, explica por que viralizou e põe no documento.
const db = supabase as unknown as SupabaseClient;

type Plataforma = "youtube" | "instagram" | "tiktok";
interface Achado {
  plataforma: Plataforma; link: string; titulo: string; criador: string | null; visualizacoes: number | null;
  duracao?: number | null; capa_url?: string | null; capa?: { base64: string; tipo: string } | null; porque?: string;
  salvo?: "salvando" | "transcrevendo" | "pronto";
}
interface Estrutura { id: string; nome: string; estrutura: string; exemplos: string }
type Ferramenta = "buscar" | "headlines" | "link";

const fmt = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n));
const minutos = (s: number | null | undefined) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

async function invocar<T>(comando: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(comando, args);
}

export function RadarVirais({ editor, clienteId, onUsado }: { editor: Editor; clienteId: string | null; onUsado: () => void }) {
  const [ferramenta, setFerramenta] = useState<Ferramenta>("buscar");
  if (!isDesktop()) {
    return <p className="py-10 text-center text-sm text-muted-foreground">O Radar de virais roda no app do Mac (usa a busca, a transcrição e o Claude de lá).</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-lg border p-0.5 text-xs font-medium">
        {([["buscar", "Buscar virais"], ["headlines", "Gerar headlines"], ["link", "Analisar um link"]] as [Ferramenta, string][]).map(([f, r]) => (
          <button key={f} type="button" onClick={() => setFerramenta(f)}
            className={cn("rounded-md px-3 py-1.5", ferramenta === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{r}</button>
        ))}
      </div>
      {ferramenta === "buscar" && <BuscarVirais clienteId={clienteId} />}
      {ferramenta === "headlines" && <GerarHeadlines editor={editor} clienteId={clienteId} onUsado={onUsado} />}
      {ferramenta === "link" && <AnalisarLink editor={editor} clienteId={clienteId} onUsado={onUsado} />}
    </div>
  );
}

// ------------------------------------------------------------------ Buscar virais

const PEDIDO_BUSCA = (tema: string, p: Plataforma) => `Pesquise na internet vídeos curtos do ${p === "tiktok" ? "TikTok" : "Instagram (Reels)"} que viralizaram (muitas visualizações) sobre o tema "${tema}", de preferência em português.
Responda SOMENTE com JSON: {"videos":[{"link":"URL direta do vídeo no ${p === "tiktok" ? "tiktok.com" : "instagram.com/reel"}","titulo":"…","criador":"@…","visualizacoes":número ou null,"porque":"1 frase"}]}
Até 8 vídeos, só links reais e diretos do vídeo (não de matérias nem de perfis).`;

async function salvarNoBanco(a: Achado, clienteId: string, aoMudar: (s: Achado["salvo"]) => void) {
  aoMudar("salvando");
  const { data: u } = await supabase.auth.getUser();
  const capa = a.capa && u.user ? await salvarCapa(u.user.id, a.capa) : a.capa_url ?? null;
  const { data, error } = await db.from("videos_referencia").insert({
    cliente_id: clienteId, titulo: a.titulo || a.link, link_video: a.link, plataforma: a.plataforma,
    criador: a.criador, visualizacoes: a.visualizacoes, thumbnail_url: capa, ordem: 0,
  }).select("id").single();
  if (error || !data) { toast.error("Não consegui salvar no banco"); aoMudar(undefined); return; }
  // Transcreve em segundo plano (o mesmo do modo Creator): o vídeo já aparece no Banco.
  aoMudar("transcrevendo");
  try {
    const r = await invocar<{ texto?: string; idioma?: string }>("creator_transcrever", { url: a.link, modo: "preciso" });
    if (r.texto) await db.from("videos_referencia").update({ transcricao: r.texto, idioma: r.idioma ?? null }).eq("id", (data as { id: string }).id);
    toast.success(`Salvo e transcrito: ${a.titulo.slice(0, 50)}`);
  } catch {
    toast(`Salvo no banco (sem transcrição): ${a.titulo.slice(0, 50)}`);
  }
  aoMudar("pronto");
}

function BuscarVirais({ clienteId }: { clienteId: string | null }) {
  const [tema, setTema] = useState("");
  const [plataforma, setPlataforma] = useState<Plataforma>("youtube");
  const [soCurtos, setSoCurtos] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [achados, setAchados] = useState<Achado[]>([]);

  const atualizar = (link: string, m: Partial<Achado>) => setAchados((l) => l.map((a) => (a.link === link ? { ...a, ...m } : a)));

  const buscar = async () => {
    const t = tema.trim();
    if (!t) return;
    setBuscando(true);
    setAchados([]);
    try {
      if (plataforma === "youtube") {
        const r = await invocar<{ videos: Achado[] }>("creator_transcrever", { url: t, modo: "buscar_youtube" });
        setAchados(r.videos ?? []);
      } else {
        const r = lerJson<{ videos: Omit<Achado, "plataforma">[] }>(await invocar<string>("claude_pesquisa", { pedido: PEDIDO_BUSCA(t, plataforma) }));
        const lista = (r?.videos ?? []).filter((v) => /^https?:\/\//.test(v.link)).map((v) => ({ ...v, plataforma }));
        setAchados(lista);
        setBuscando(false);
        // Confere cada link pelo yt-dlp: capa e views de verdade (um por vez).
        for (const v of lista) {
          try {
            const c = await invocar<{ capa?: Achado["capa"]; visualizacoes?: number | null }>("creator_transcrever", { url: v.link, modo: "capa" });
            atualizar(v.link, { capa: c.capa ?? null, visualizacoes: c.visualizacoes ?? v.visualizacoes });
          } catch { atualizar(v.link, { porque: `${v.porque ?? ""} (link não abriu)`.trim() }); }
        }
      }
    } catch (e) {
      toast.error(`A busca falhou: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBuscando(false);
    }
  };

  const visiveis = achados.filter((a) => !(plataforma === "youtube" && soCurtos && a.duracao != null && a.duracao > 180));

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Tema (ex.: hábitos para produtividade)" className="h-9 pl-8" />
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-xs font-medium">
          {([["youtube", "YouTube", Youtube], ["instagram", "Instagram", Instagram], ["tiktok", "TikTok", Play]] as [Plataforma, string, typeof Youtube][]).map(([p, r, Icone]) => (
            <button key={p} type="button" onClick={() => setPlataforma(p)}
              className={cn("flex items-center gap-1 rounded-md px-2.5 py-1.5", plataforma === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <Icone className="h-3.5 w-3.5" />{r}
            </button>
          ))}
        </div>
        {plataforma === "youtube" && (
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={soCurtos} onChange={(e) => setSoCurtos(e.target.checked)} />Só curtos (até 3 min)</label>
        )}
        <Button type="submit" size="sm" className="h-9 gap-1" disabled={!tema.trim() || buscando}>
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Buscar
        </Button>
      </form>
      {buscando && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {plataforma === "youtube" ? "Buscando no YouTube…" : `O Claude está pesquisando no ${plataforma === "tiktok" ? "TikTok" : "Instagram"} (uns 30 s)…`}
        </p>
      )}
      {!buscando && achados.length > 0 && visiveis.length === 0 && <p className="text-sm text-muted-foreground">Nenhum curto nessa busca: desmarque "Só curtos".</p>}
      <div className="flex w-full gap-3 overflow-x-auto overscroll-x-contain pb-3"
        onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
        {visiveis.map((a) => {
          const capa = a.capa?.base64 ? `data:${a.capa.tipo};base64,${a.capa.base64}` : a.capa_url;
          const horizontal = a.plataforma === "youtube" && (a.duracao ?? 0) > 180;
          return (
            <div key={a.link} className={cn("shrink-0", horizontal ? "w-64" : "w-40")}>
              <button type="button" onClick={() => void abrirLinkExterno(a.link)} title="Assistir"
                className={cn("group relative w-full overflow-hidden rounded-xl bg-muted", horizontal ? "aspect-video" : "aspect-[9/16]")}>
                {capa ? <img src={capa} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-500/25 to-purple-500/25"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 bg-gradient-to-b from-black/60 to-transparent p-2">
                  {a.visualizacoes ? <span className="flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10.5px] font-semibold text-white"><Eye className="h-3 w-3" />{fmt(a.visualizacoes)}</span> : <span />}
                  {a.duracao ? <span className="rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">{minutos(a.duracao)}</span> : null}
                </div>
              </button>
              <p className="mt-1.5 line-clamp-2 text-[12.5px] font-medium leading-snug">{a.titulo || "Sem título"}</p>
              {a.criador && <p className="truncate text-[11px] text-muted-foreground">{a.criador}</p>}
              {a.porque && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{a.porque}</p>}
              <Button size="sm" variant={a.salvo ? "outline" : "default"} className="mt-1.5 h-7 w-full gap-1 text-xs" disabled={!!a.salvo || !clienteId}
                title={clienteId ? undefined : "Abra um documento de projeto para salvar no banco dele"}
                onClick={() => clienteId && void salvarNoBanco(a, clienteId, (s) => atualizar(a.link, { salvo: s }))}>
                {a.salvo === "salvando" ? <><Loader2 className="h-3 w-3 animate-spin" />Salvando…</>
                  : a.salvo === "transcrevendo" ? <><Loader2 className="h-3 w-3 animate-spin" />Transcrevendo…</>
                  : a.salvo === "pronto" ? <><Check className="h-3 w-3" />No banco</> : <><Plus className="h-3 w-3" />Salvar no banco</>}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Gerar headlines

function GerarHeadlines({ editor, clienteId, onUsado }: { editor: Editor; clienteId: string | null; onUsado: () => void }) {
  const [estruturas, setEstruturas] = useState<Estrutura[]>([]);
  const [usar, setUsar] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Estrutura | null>(null);
  const [tema, setTema] = useState("");
  const [quantas, setQuantas] = useState(5);
  const [gerando, setGerando] = useState(false);
  const [headlines, setHeadlines] = useState<{ texto: string; estrutura?: string; usada?: boolean }[]>([]);

  useEffect(() => {
    if (!clienteId) return;
    void db.from("clientes").select("estruturas_headline").eq("id", clienteId).maybeSingle().then(({ data }) => {
      const l = ((data as { estruturas_headline?: Estrutura[] } | null)?.estruturas_headline ?? []).filter((e) => e && e.id);
      setEstruturas(l);
      setUsar(new Set(l.map((e) => e.id)));
    });
  }, [clienteId]);

  const salvarEstruturas = async (l: Estrutura[]) => {
    if (!clienteId) return;
    setEstruturas(l);
    const { error } = await db.from("clientes").update({ estruturas_headline: l }).eq("id", clienteId);
    if (error) toast.error("Não consegui salvar a estrutura");
  };

  const gerar = async () => {
    const escolhidas = estruturas.filter((e) => usar.has(e.id));
    setGerando(true);
    setHeadlines([]);
    // Exemplos reais do banco (os de mais views) para o tom.
    const { data: refs } = clienteId
      ? await db.from("videos_referencia").select("titulo, titulo_pt, visualizacoes").eq("cliente_id", clienteId).order("visualizacoes", { ascending: false, nullsFirst: false }).limit(12)
      : { data: [] };
    const exemplos = ((refs ?? []) as { titulo: string; titulo_pt: string | null }[]).map((r) => `- ${r.titulo_pt || r.titulo}`).join("\n");
    const pedido = `Você escreve headlines (a frase de abertura de um vídeo curto, Reels) em português do Brasil, com potencial viral.
Tema: ${tema.trim() || "livre (escolha temas do nicho dos exemplos)"}
Quantidade: ${quantas}
${escolhidas.length ? `Use ESTAS estruturas (distribua entre elas e diga qual usou):\n${escolhidas.map((e) => `## ${e.nome}\n${e.estrutura}${e.exemplos.trim() ? `\nExemplos:\n${e.exemplos}` : ""}`).join("\n\n")}` : "Use estruturas de gancho comprovadas (lista numerada, curiosidade, contraste, promessa de transformação, 'ninguém te conta')."}
${exemplos ? `Headlines que já viralizaram neste nicho (tom e assunto de referência, NÃO copie):\n${exemplos}` : ""}
Responda SOMENTE com JSON: {"headlines":[{"texto":"…","estrutura":"nome da estrutura"}]}`;
    try {
      const r = lerJson<{ headlines: { texto: string; estrutura?: string }[] }>(await invocar<string>("claude_rapido", { pedido, modelo: "sonnet" }));
      setHeadlines((r?.headlines ?? []).filter((h) => h.texto?.trim()));
      if (!r?.headlines?.length) toast("O Claude não devolveu headlines. Tente de novo.");
    } catch (e) {
      toast.error(`Não consegui gerar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGerando(false);
    }
  };

  const inserir = (textos: string[]) => {
    let n = proximoNumeroHeadline(editor.getHTML());
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = textos.map((t) => `<h2>Headline ${String(n++).padStart(2, "0")}: ${esc(t)}</h2><p></p>`).join("");
    editor.chain().focus("end").insertContent(html).run();
    setHeadlines((l) => l.map((h) => (textos.includes(h.texto) ? { ...h, usada: true } : h)));
    toast.success(textos.length === 1 ? "Headline no documento" : `${textos.length} headlines no documento`);
    if (textos.length > 1) onUsado();
  };

  if (!clienteId) return <p className="py-6 text-sm text-muted-foreground">Abra um documento de um projeto: as estruturas de headline ficam guardadas no projeto.</p>;

  return (
    <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estruturas do projeto</p>
        {estruturas.length === 0 && !editando && <p className="text-xs text-muted-foreground">Nenhuma ainda. Cadastre as estruturas que funcionam (ex.: "Lista com número", "Ninguém te conta").</p>}
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {estruturas.map((e) => (
            <div key={e.id} className="group flex items-start gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm">
              <input type="checkbox" className="mt-1" checked={usar.has(e.id)} onChange={(ev) => setUsar((s) => { const n = new Set(s); if (ev.target.checked) n.add(e.id); else n.delete(e.id); return n; })} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditando(e)}>
                <p className="font-medium">{e.nome}</p>
                <p className="line-clamp-2 text-[11px] text-muted-foreground">{e.estrutura}</p>
              </button>
              <button type="button" title="Apagar" className="text-muted-foreground opacity-0 hover:text-rose-600 group-hover:opacity-100"
                onClick={() => void salvarEstruturas(estruturas.filter((x) => x.id !== e.id))}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {editando ? (
          <div className="space-y-1.5 rounded-lg border-2 border-primary/40 p-2">
            <Input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Nome (ex.: Lista com número)" className="h-8" />
            <textarea value={editando.estrutura} onChange={(e) => setEditando({ ...editando, estrutura: e.target.value })} rows={3}
              className="w-full rounded-md border bg-background p-2 text-xs" placeholder="A estrutura (ex.: [número] + [coisas] + que [resultado] + [tempo])" />
            <textarea value={editando.exemplos} onChange={(e) => setEditando({ ...editando, exemplos: e.target.value })} rows={3}
              className="w-full rounded-md border bg-background p-2 text-xs" placeholder="Exemplos que viralizaram (um por linha)" />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button size="sm" className="h-7" disabled={!editando.nome.trim() || !editando.estrutura.trim()} onClick={() => {
                const e = { ...editando, nome: editando.nome.trim(), estrutura: editando.estrutura.trim() };
                const l = estruturas.some((x) => x.id === e.id) ? estruturas.map((x) => (x.id === e.id ? e : x)) : [...estruturas, e];
                setUsar((s) => new Set(s).add(e.id));
                void salvarEstruturas(l);
                setEditando(null);
              }}>Salvar</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-8 gap-1 self-start" onClick={() => setEditando({ id: crypto.randomUUID(), nome: "", estrutura: "", exemplos: "" })}>
            <Plus className="h-3.5 w-3.5" />Nova estrutura
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void gerar(); }}>
          <Input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Tema (opcional, ex.: sono e produtividade)" className="h-9" />
          <select value={quantas} onChange={(e) => setQuantas(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
            {[3, 5, 10, 15].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <Button type="submit" size="sm" className="h-9 gap-1" disabled={gerando}>
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Gerar
          </Button>
        </form>
        {gerando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />O Claude está escrevendo…</p>}
        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {headlines.map((h, i) => (
            <div key={i} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", h.usada && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{h.texto}</p>
                {h.estrutura && <p className="text-[11px] text-muted-foreground">{h.estrutura}</p>}
              </div>
              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={h.usada} onClick={() => inserir([h.texto])}>
                {h.usada ? "No documento" : "Inserir"}
              </Button>
            </div>
          ))}
        </div>
        {headlines.some((h) => !h.usada) && (
          <Button size="sm" className="self-end" onClick={() => inserir(headlines.filter((h) => !h.usada).map((h) => h.texto))}>Inserir todas no documento</Button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Analisar um link

const PEDIDO_ANALISE = (titulo: string, autor: string, views: number | null | undefined, transcricao: string) => `Você analisa um vídeo curto viral que vai servir de referência para um roteiro novo.
Criador: ${autor || "?"} · ${views ? `${views.toLocaleString("pt-BR")} visualizações` : "visualizações desconhecidas"}
Título: ${titulo}
Transcrição:
"""
${transcricao.slice(0, 6000)}
"""
Responda SOMENTE com um JSON:
{"headline": "a frase de abertura (gancho) do vídeo, em português do Brasil, natural",
 "notavel": ["3 a 5 fatos, dados, estudos ou exemplos marcantes e verdadeiros sobre o tema, que enriqueceriam um roteiro novo (cite a fonte entre parênteses quando souber; se não tiver certeza, escreva (conferir))"],
 "porque": ["3 a 5 motivos objetivos de o vídeo ter viralizado: gancho, curiosidade, emoção, estrutura, ritmo, CTA, identificação…"]}`;

function AnalisarLink({ editor, clienteId, onUsado }: { editor: Editor; clienteId: string | null; onUsado: () => void }) {
  const [link, setLink] = useState("");
  const [etapa, setEtapa] = useState<"" | "transcrevendo" | "analisando">("");
  const [r, setR] = useState<{ link: string; titulo: string; autor: string; views: number | null; texto: string; capa: Achado["capa"]; analise: ReturnType<typeof lerAnalise> } | null>(null);
  const [salvo, setSalvo] = useState<Achado["salvo"]>(undefined);

  const analisar = async () => {
    const l = link.trim();
    if (!/^https?:\/\//.test(l)) { toast("Cole o link do vídeo (começando com http)."); return; }
    setR(null); setSalvo(undefined); setEtapa("transcrevendo");
    try {
      const t = await invocar<{ texto?: string; titulo?: string; autor?: string; visualizacoes?: number | null; capa?: Achado["capa"] }>("creator_transcrever", { url: l, modo: "preciso" });
      setEtapa("analisando");
      const texto = (t.texto ?? "").trim();
      const analise = texto ? lerAnalise(await invocar<string>("claude_rapido", { pedido: PEDIDO_ANALISE(t.titulo ?? "", t.autor ?? "", t.visualizacoes, texto), modelo: "sonnet" })) : { notavel: [], porque: [] };
      setR({ link: l, titulo: t.titulo ?? l, autor: t.autor ?? "", views: t.visualizacoes ?? null, texto, capa: t.capa ?? null, analise });
    } catch (e) {
      toast.error(`Não consegui analisar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEtapa("");
    }
  };

  const usar = () => {
    if (!r) return;
    editor.chain().focus("end").insertContent(montarBlocoReferencia({
      numero: proximoNumeroHeadline(editor.getHTML()), headline: r.analise.headline || r.titulo,
      link: r.link, transcricao: r.texto || null, notavel: r.analise.notavel, porque: r.analise.porque,
    })).run();
    onUsado();
  };

  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void analisar(); }}>
        <div className="relative flex-1">
          <Link2 className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole o link de um Reels, TikTok ou YouTube" className="h-9 pl-8" />
        </div>
        <Button type="submit" size="sm" className="h-9 gap-1" disabled={!!etapa}>{etapa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Analisar</Button>
      </form>
      {etapa && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{etapa === "transcrevendo" ? "Baixando e transcrevendo o vídeo…" : "O Claude está analisando por que viralizou…"}</p>}
      {r && (
        <div className="flex gap-4">
          <div className="aspect-[9/16] w-40 shrink-0 overflow-hidden rounded-xl bg-muted">
            {r.capa?.base64 && <img src={`data:${r.capa.tipo};base64,${r.capa.base64}`} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <div>
              <p className="font-bold leading-snug">{r.analise.headline || r.titulo}</p>
              <p className="text-xs text-muted-foreground">{[r.autor, r.views ? `${fmt(r.views)} views` : null].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-2.5 text-[12.5px]">
              {r.analise.porque.length > 0 && <><p className="mb-1 font-semibold">Por que viralizou</p><ul className="mb-2 list-disc pl-4">{r.analise.porque.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
              {r.analise.notavel.length > 0 && <><p className="mb-1 font-semibold">Conteúdo notável</p><ul className="mb-2 list-disc pl-4">{r.analise.notavel.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
              <p className="mb-1 font-semibold">Transcrição</p><p className="whitespace-pre-line text-muted-foreground">{r.texto || "Sem fala."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={usar}>Usar no documento</Button>
              <Button size="sm" variant="outline" disabled={!!salvo || !clienteId} onClick={() => clienteId && void (async () => {
                setSalvo("salvando");
                const { data: u } = await supabase.auth.getUser();
                const capa = r.capa && u.user ? await salvarCapa(u.user.id, r.capa) : null;
                const plataforma = /tiktok/.test(r.link) ? "tiktok" : /youtu/.test(r.link) ? "youtube" : "instagram";
                const { error } = await db.from("videos_referencia").insert({ cliente_id: clienteId, titulo: r.analise.headline || r.titulo, link_video: r.link, plataforma, criador: r.autor || null, visualizacoes: r.views, thumbnail_url: capa, transcricao: r.texto || null, ordem: 0 });
                if (error) { toast.error("Não consegui salvar no banco"); setSalvo(undefined); } else { setSalvo("pronto"); toast.success("Salvo no banco"); }
              })()}>{salvo === "pronto" ? <><Check className="h-3.5 w-3.5" />No banco</> : salvo ? "Salvando…" : "Salvar no banco"}</Button>
              <Button size="sm" variant="ghost" onClick={() => void abrirLinkExterno(r.link)}>Assistir</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
