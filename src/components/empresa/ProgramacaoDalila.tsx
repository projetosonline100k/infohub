import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, ExternalLink, GalleryHorizontal, ListChecks, Loader2, Pencil, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { EdicaoResumo } from "./EditorVideo";
import { ProgramarCarrossel, SemInstagram, carregarAgenda, instagramDoProjeto, type ItemAgenda } from "./ProgramarCarrossel";
import { ProgramarReel } from "./ProgramarReel";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { diaLocal } from "@/lib/empresa/programacao";
import { toast } from "sonner";

const db = supabase as unknown as SupabaseClient;
interface Post {
  tipo: "carrossel" | "reel"; id: string; titulo: string; status: string; quando: string | null;
  tarefaId: string | null; pelaDalila: boolean; capa: string | null; permalink: string | null;
}
/** O que ainda NÃO está programado mas já está a caminho da Dalila: edição esperando a aprovação, vídeo sendo preparado, pronto para ela escolher o dia. */
interface Entrando { chave: string; tipo: "reel" | "carrossel"; titulo: string; etapa: 1 | 2 | 3 | 4; texto: string; erro: boolean; video: string | null; capa: string | null; edicao?: EdicaoResumo }
const ETAPAS = ["Edição", "Sua aprovação", "Preparando", "Dalila programa", "Programado"];
interface TarefaDalila { id: string; titulo: string; data_vencimento: string | null }

const quandoTexto = (iso: string | null) => {
  if (!iso) return "sem data";
  const d = new Date(iso);
  const dia = isToday(d) ? "Hoje" : isTomorrow(d) ? "Amanhã" : format(d, "EEE, d 'de' MMM", { locale: ptBR });
  return `${dia} · ${format(d, "HH:mm")}`;
};

/** Guia "Programação" (16/11/2026, Davi: "quero ver a Dalila, o calendário, se ela vai programar algo, alterar"): o calendário de posts do projeto, o que está programado
 *  (marcando o que a Dalila escolheu sozinha), o que já saiu e a fila dela. Clicar num post abre a tela de dia, hora e legenda (a mesma de Programados). */
export function ProgramacaoDalila({ clienteId, onAbrirEdicao }: { clienteId: string; onAbrirEdicao?: (e: EdicaoResumo) => void }) {
  // As telas de dia/hora/legenda abrem AQUI dentro (e não na tela da empresa): fechar este painel e abrir outro no mesmo instante deixava a tela travada.
  const [programar, setProgramar] = useState<{ tipo: "carrossel" | "reel"; tarefaId: string } | null>(null);
  const [semanas, setSemanas] = useState(0);   // deslocamento do calendário, em semanas
  const [entrando, setEntrando] = useState<Entrando[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [agenda, setAgenda] = useState<ItemAgenda[]>([]);
  const [tarefas, setTarefas] = useState<TarefaDalila[]>([]);
  const [temInstagram, setTemInstagram] = useState<boolean | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "carrossel" | "reel">("todos");

  const ler = useCallback(async () => {
    const [cars, reels, ag, ig, dal] = await Promise.all([
      db.from("carrosseis").select("id, numero, tema, status, programado_para, publicado_em, paginas, tarefa_data_id, programado_pela_dalila_em, permalink")
        .eq("cliente_id", clienteId).in("status", ["programado", "publicando", "publicado"]).order("programado_para", { ascending: false }).limit(60),
      db.from("reels").select("id, titulo, status, programado_para, publicado_em, tarefa_data_id, programado_pela_dalila_em, permalink")
        .eq("cliente_id", clienteId).in("status", ["programado", "publicando", "publicado"]).order("programado_para", { ascending: false }).limit(60),
      carregarAgenda(clienteId),
      instagramDoProjeto(clienteId),
      db.from("membros").select("id").eq("cliente_id", clienteId).ilike("nome", "dalila").limit(1),
    ]);
    const lista: Post[] = [
      ...((cars.data || []) as { id: string; numero: number | null; tema: string; status: string; programado_para: string | null; publicado_em: string | null; paginas: string[] | null; tarefa_data_id: string | null; programado_pela_dalila_em: string | null; permalink: string | null }[])
        .map((c) => ({ tipo: "carrossel" as const, id: c.id, titulo: `${c.numero ? `${String(c.numero).padStart(3, "0")} · ` : ""}${c.tema}`, status: c.status, quando: c.publicado_em ?? c.programado_para, tarefaId: c.tarefa_data_id, pelaDalila: !!c.programado_pela_dalila_em, capa: c.paginas?.[0] ?? null, permalink: c.permalink })),
      ...((reels.data || []) as { id: string; titulo: string; status: string; programado_para: string | null; publicado_em: string | null; tarefa_data_id: string | null; programado_pela_dalila_em: string | null; permalink: string | null }[])
        .map((r) => ({ tipo: "reel" as const, id: r.id, titulo: r.titulo, status: r.status, quando: r.publicado_em ?? r.programado_para, tarefaId: r.tarefa_data_id, pelaDalila: !!r.programado_pela_dalila_em, capa: null, permalink: r.permalink })),
    ];
    setPosts(lista); setAgenda(ag); setTemInstagram(!!ig);
    // A caminho da Dalila (16/11, Davi: "o vídeo que acabou de ficar pronto já entrasse na fila da Dalila e eu pudesse ver"): edição em revisão, vídeo sendo preparado, pronto para ela programar.
    const [eds, pre, carsAprov] = await Promise.all([
      db.from("edicoes_video").select("id, titulo, status, mensagem, versao, final_drive, duracao, formato, opcoes_formato, previa_url, projeto_em")
        .eq("cliente_id", clienteId).eq("status", "revisar").or("formato.is.null,formato.neq.dark").order("atualizado_em", { ascending: false }),
      db.from("reels").select("id, titulo, status, mensagem, edicao_id").eq("cliente_id", clienteId).in("status", ["preparando", "pronto", "erro"]).order("atualizado_em", { ascending: false }),
      db.from("carrosseis").select("id, numero, tema, paginas, status").eq("cliente_id", clienteId).eq("status", "aprovado"),
    ]);
    const reelsPre = (pre.data || []) as { id: string; titulo: string; status: string; mensagem: string | null; edicao_id: string }[];
    const previas = new Map<string, string | null>();
    if (reelsPre.length) {
      const { data: e2 } = await db.from("edicoes_video").select("id, previa_url").in("id", reelsPre.map((r) => r.edicao_id));
      for (const e of (e2 || []) as { id: string; previa_url: string | null }[]) previas.set(e.id, e.previa_url);
    }
    const nova: Entrando[] = [
      ...((eds.data || []) as EdicaoResumo[]).map((e) => ({ chave: `ed-${e.id}`, tipo: "reel" as const, titulo: e.titulo, etapa: 1 as const, texto: "Pronto: esperando a sua aprovação", erro: false, video: e.previa_url ?? null, capa: null, edicao: e })),
      ...reelsPre.map((r) => ({ chave: `reel-${r.id}`, tipo: "reel" as const, titulo: r.titulo, etapa: (r.status === "preparando" ? 2 : 3) as 2 | 3, erro: r.status === "erro",
        texto: r.status === "erro" ? (r.mensagem ?? "Deu erro ao preparar o vídeo") : r.status === "pronto" ? "Pronto: a Dalila escolhe o primeiro dia livre" : (r.mensagem ?? "Dalila preparando o vídeo e a legenda"), video: previas.get(r.edicao_id) ?? null, capa: null })),
      ...((carsAprov.data || []) as { id: string; numero: number | null; tema: string; paginas: string[] | null }[]).map((c) => ({ chave: `car-${c.id}`, tipo: "carrossel" as const, titulo: `${c.numero ? `${String(c.numero).padStart(3, "0")} · ` : ""}${c.tema}`, etapa: 3 as const, erro: false, texto: "Aprovado: a Dalila escolhe o primeiro dia livre", video: null, capa: c.paginas?.[0] ?? null })),
    ];
    setEntrando(nova);
    const dalilaId = ((dal.data || []) as { id: string }[])[0]?.id;
    if (dalilaId) {
      const { data: t } = await db.from("atividades").select("id, titulo, data_vencimento").eq("responsavel_id", dalilaId).is("deleted_at", null).eq("concluida", false).order("data_vencimento", { nullsFirst: false }).limit(20);
      setTarefas((t || []) as TarefaDalila[]);
    }
  }, [clienteId]);
  useEffect(() => {
    void ler();
    const t = window.setInterval(() => { if (!document.hidden) void ler(); }, 20000);
    return () => window.clearInterval(t);
  }, [ler]);

  const agora = Date.now();
  const futuros = useMemo(() => (posts ?? []).filter((p) => p.status !== "publicado" && (filtro === "todos" || p.tipo === filtro)).sort((a, b) => (a.quando ?? "").localeCompare(b.quando ?? "")), [posts, filtro]);
  const publicados = useMemo(() => (posts ?? []).filter((p) => p.status === "publicado" && (filtro === "todos" || p.tipo === filtro)).sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? "")).slice(0, 8), [posts, filtro]);
  const contagem = useMemo(() => {
    const l = posts ?? [];
    return {
      programados: l.filter((p) => p.status === "programado").length,
      hoje: l.filter((p) => p.status !== "publicado" && p.quando && isToday(new Date(p.quando))).length,
      dalila: l.filter((p) => p.status === "programado" && p.pelaDalila).length,
      semana: l.filter((p) => p.status === "publicado" && p.quando && agora - Date.parse(p.quando) < 7 * 86400000).length,
    };
  }, [posts, agora]);

  const abrirPost = (p: Post) => {
    if (p.status === "programado") {
      if (p.tarefaId) setProgramar({ tipo: p.tipo, tarefaId: p.tarefaId });
      else toast.error("Esse post não tem a tela de data ligada. Peça à Dalila para reprogramar.");
    } else if (p.status === "publicado" && p.permalink) void abrirLinkExterno(p.permalink);
  };
  const hojeDia = diaLocal(new Date());
  const inicioCal = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + semanas * 7); d.setHours(0, 0, 0, 0); return d; })();
  const diasCal = Array.from({ length: 35 }, (_, k) => { const d = new Date(inicioCal); d.setDate(inicioCal.getDate() + k); return d; });
  const videosCal = agenda.filter((a) => a.tipo === "video");

  if (posts === null) return <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" />;
  const tile = (Icone: typeof Send, valor: number, rotulo: string, cor: string, fundo: string) => (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1320] px-4 py-3.5">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", fundo)}><Icone className={cn("h-5 w-5", cor)} /></span>
      <span><span className={cn("block text-2xl font-bold leading-none tabular-nums", cor)}>{valor}</span><span className="text-xs text-white/60">{rotulo}</span></span>
    </div>);
  const linha = (p: Post) => {
    const clicavel = (!!p.tarefaId && p.status === "programado") || (p.status === "publicado" && !!p.permalink);
    return (
      <button key={p.tipo + p.id} type="button" disabled={!clicavel} onClick={() => abrirPost(p)}
        title={p.status === "programado" ? "Ver o vídeo e mudar dia, hora ou legenda" : p.status === "publicado" ? "Abrir no Instagram" : p.status === "publicando" ? "Publicando agora" : undefined}
        className={cn("flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#0c1320] p-2.5 text-left", clicavel && "hover:border-violet-400/40 hover:bg-white/5")}>
        {p.capa ? <img src={p.capa} alt="" className={cn("h-14 w-11 shrink-0 rounded-md object-cover", p.status === "publicado" && "opacity-60 grayscale")} />
          : <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-300"><Clapperboard className="h-5 w-5" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{p.titulo}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/55">
            {p.tipo === "carrossel" ? <GalleryHorizontal className="h-3 w-3" /> : <Clapperboard className="h-3 w-3" />}{p.tipo === "carrossel" ? "Carrossel" : "Reel"} · {quandoTexto(p.quando)}
            {p.pelaDalila && p.status === "programado" && <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] text-pink-200"><Sparkles className="h-3 w-3" />Dalila escolheu o dia</span>}
          </span>
        </span>
        {p.status === "publicado" ? <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300"><CheckCircle2 className="h-3 w-3" />Publicado</span>
          : p.status === "publicando" ? <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300"><Loader2 className="h-3 w-3 animate-spin" />Publicando</span>
          : <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-300"><CalendarDays className="h-3 w-3" />Programado{clicavel && <Pencil className="ml-1 h-3 w-3 opacity-60" />}</span>}
      </button>);
  };

  return (
    <div className="space-y-4">
      {temInstagram === false && <SemInstagram />}
      {entrando.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-violet-400/30 bg-violet-500/5 p-4">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-violet-300" />A caminho da Dalila ({entrando.length})</h3>
          <div className="grid gap-2 lg:grid-cols-2">
            {entrando.map((e) => (
              <div key={e.chave} className="flex gap-3 rounded-xl border border-white/10 bg-[#0c1320] p-3">
                <span className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-black/40">
                  {e.video ? <video src={`${e.video}#t=1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                    : e.capa ? <img src={e.capa} alt="" className="h-full w-full object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-violet-300"><Clapperboard className="h-6 w-6" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" title={e.titulo}>{e.titulo}</span>
                  <span className={cn("mt-0.5 block text-xs", e.erro ? "text-rose-300" : "text-white/60")}>{e.texto}</span>
                  <span className="mt-2 flex items-center gap-1" aria-label={`Etapa: ${ETAPAS[e.etapa]}`}>
                    {ETAPAS.map((n, i) => (
                      <span key={n} className="flex flex-1 flex-col gap-1">
                        <span className={cn("h-1.5 rounded-full", i < e.etapa ? "bg-emerald-400" : i === e.etapa ? (e.erro ? "bg-rose-400" : "animate-pulse bg-violet-400") : "bg-white/15")} />
                        <span className={cn("truncate text-[9px]", i === e.etapa ? "font-semibold text-white" : "text-white/35")}>{n}</span>
                      </span>))}
                  </span>
                  {e.edicao && onAbrirEdicao && <button type="button" onClick={() => onAbrirEdicao(e.edicao!)} className="mt-2 rounded-lg bg-violet-500 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-400">Ver e aprovar</button>}
                </span>
              </div>))}
          </div>
          <p className="text-[11px] text-white/40">Depois que você aprova, o Mac prepara o vídeo e a legenda e a Dalila programa sozinha no primeiro dia livre (reel às 18h, carrossel às 10h, dark às 12h). Ele aparece em “Próximos posts” e você pode mudar o dia.</p>
        </section>)}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile(CalendarDays, contagem.programados, "Programados", "text-cyan-300", "bg-cyan-500/15")}
        {tile(Send, contagem.hoje, "Saem hoje", "text-amber-300", "bg-amber-500/15")}
        {tile(Sparkles, contagem.dalila, "Dalila escolheu o dia", "text-pink-300", "bg-pink-500/15")}
        {tile(CheckCircle2, contagem.semana, "Publicados na semana", "text-emerald-300", "bg-emerald-500/15")}
      </div>
      <section className="rounded-2xl border border-white/10 bg-[#0c1320] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5 text-cyan-300" />Calendário</h3>
          <span className="text-sm text-white/55">{format(diasCal[0], "d MMM", { locale: ptBR })} a {format(diasCal[34], "d MMM yyyy", { locale: ptBR })}</span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setSemanas((n) => n - 5)} className="rounded-lg border border-white/15 p-1.5 hover:bg-white/10" title="5 semanas antes"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setSemanas(0)} className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10">Hoje</button>
            <button type="button" onClick={() => setSemanas((n) => n + 5)} className="rounded-lg border border-white/15 p-1.5 hover:bg-white/10" title="5 semanas depois"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase text-white/45">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {diasCal.map((d) => {
            const dia = diaLocal(d);
            const doDia = (posts ?? []).filter((p) => p.quando && diaLocal(new Date(p.quando)) === dia && (filtro === "todos" || p.tipo === filtro))
              .sort((a, b) => (a.quando ?? "").localeCompare(b.quando ?? ""));
            const vids = videosCal.filter((v) => v.dia === dia);
            const passado = dia < hojeDia;
            return (
              <div key={dia} className={cn("flex min-h-[132px] flex-col gap-1 rounded-xl border p-1.5", dia === hojeDia ? "border-sky-400 bg-sky-500/5" : "border-white/10 bg-black/20", passado && !doDia.length && "opacity-50")}>
                <span className={cn("text-xs font-semibold", dia === hojeDia ? "text-sky-300" : "text-white/70")}>{d.getDate()}{d.getDate() === 1 ? ` ${format(d, "MMM", { locale: ptBR })}` : ""}</span>
                {doDia.map((p) => {
                  const podeAbrir = (p.status === "programado" && !!p.tarefaId) || (p.status === "publicado" && !!p.permalink);
                  return (
                    <button key={p.tipo + p.id} type="button" disabled={!podeAbrir} onClick={() => abrirPost(p)}
                      title={`${p.tipo === "carrossel" ? "Carrossel" : "Reel"} · ${p.titulo}${p.quando ? ` · ${format(new Date(p.quando), "HH:mm")}` : ""}${p.status === "programado" ? " — clique para ver e mudar a data" : p.status === "publicado" ? " — publicado: abrir no Instagram" : ""}`}
                      className={cn("flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight",
                        p.status === "publicado" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : p.status === "publicando" ? "border-amber-400/40 bg-amber-500/10 text-amber-100" : "border-cyan-400/40 bg-cyan-500/10 text-cyan-100",
                        podeAbrir && "hover:brightness-125")}>
                      {p.capa ? <img src={p.capa} alt="" className={cn("h-8 w-6 shrink-0 rounded-sm object-cover", p.status === "publicado" && "opacity-60 grayscale")} />
                        : <span className="flex h-8 w-6 shrink-0 items-center justify-center rounded-sm bg-black/30">{p.tipo === "reel" ? <Clapperboard className="h-3.5 w-3.5" /> : <GalleryHorizontal className="h-3.5 w-3.5" />}</span>}
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.quando ? format(new Date(p.quando), "HH:mm") : ""} {p.titulo}</span>
                        <span className="flex items-center gap-1 text-[10px] opacity-70">{p.status === "publicado" ? <><CheckCircle2 className="h-2.5 w-2.5" />publicado</> : p.status === "publicando" ? "publicando…" : <><Pencil className="h-2.5 w-2.5" />programado</>}{p.pelaDalila && p.status === "programado" && <Sparkles className="h-2.5 w-2.5 text-pink-300" />}{p.status === "publicado" && p.permalink && <ExternalLink className="h-2.5 w-2.5" />}</span></span>
                    </button>);
                })}
                {vids.map((v, k) => <span key={k} className="truncate rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200" title={v.titulo}>▶ {v.titulo}</span>)}
                {!passado && !doDia.length && !vids.length && <span className="mt-auto text-[10px] text-emerald-400/80">livre</span>}
              </div>);
          })}
        </div>
        <p className="mt-2 text-[11px] text-white/40">Azul = programado (clique para ver o vídeo e mudar dia, hora ou legenda) · verde = publicado (clique abre no Instagram) · ✨ = a Dalila escolheu o dia · ▶ = vídeo com data no cronograma.</p>
      </section>
      <div className="grid gap-4">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">Próximos posts</h3>
            <div className="ml-auto flex rounded-xl border border-white/10 bg-[#0c1320] p-0.5 text-xs">
              {([["todos", "Todos"], ["carrossel", "Carrosséis"], ["reel", "Reels"]] as const).map(([v, r]) => (
                <button key={v} type="button" onClick={() => setFiltro(v)} className={cn("rounded-lg px-2.5 py-1", filtro === v ? "bg-violet-500 font-semibold text-white" : "text-white/60")}>{r}</button>))}
            </div>
          </div>
          {futuros.length === 0 ? <p className="rounded-xl bg-white/5 p-6 text-center text-sm text-white/50">Nada programado. Quando você aprovar um carrossel ou reel, a Dalila escolhe o primeiro dia livre e ele aparece aqui.</p> : futuros.map(linha)}
          {publicados.length > 0 && <><h3 className="pt-2 text-sm font-semibold text-white/60">Já publicados</h3>{publicados.map(linha)}</>}
          <p className="text-[11px] text-white/40">Clique num post programado para mudar dia, hora ou legenda. A Dalila programa sozinha o primeiro dia livre (carrossel às 10h, reel às 18h, dark às 12h).</p>
        </section>
      </div>
      <ProgramarCarrossel tarefaId={programar?.tipo === "carrossel" ? programar.tarefaId : null} onFechar={() => { setProgramar(null); void ler(); }} />
      <ProgramarReel tarefaId={programar?.tipo === "reel" ? programar.tarefaId : null} onFechar={() => { setProgramar(null); void ler(); }} />
      {tarefas.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-[#0c1320] p-4">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-bold"><ListChecks className="h-5 w-5 text-white/70" />Fila da Dalila</h3>
          <ul className="space-y-1.5">{tarefas.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{t.titulo}</span>
              {t.data_vencimento && <span className="shrink-0 text-xs text-white/45">{t.data_vencimento.split("-").reverse().slice(0, 2).join("/")}</span>}</li>))}</ul>
        </section>)}
    </div>
  );
}
