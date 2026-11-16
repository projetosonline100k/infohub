import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, Clapperboard, GalleryHorizontal, ListChecks, Loader2, Pencil, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CalendarioPosts, SemInstagram, carregarAgenda, instagramDoProjeto, type ItemAgenda } from "./ProgramarCarrossel";

const db = supabase as unknown as SupabaseClient;
interface Post {
  tipo: "carrossel" | "reel"; id: string; titulo: string; status: string; quando: string | null;
  tarefaId: string | null; pelaDalila: boolean; capa: string | null;
}
interface TarefaDalila { id: string; titulo: string; data_vencimento: string | null }

const quandoTexto = (iso: string | null) => {
  if (!iso) return "sem data";
  const d = new Date(iso);
  const dia = isToday(d) ? "Hoje" : isTomorrow(d) ? "Amanhã" : format(d, "EEE, d 'de' MMM", { locale: ptBR });
  return `${dia} · ${format(d, "HH:mm")}`;
};

/** Guia "Programação" (16/11/2026, Davi: "quero ver a Dalila, o calendário, se ela vai programar algo, alterar"): o calendário de posts do projeto, o que está programado
 *  (marcando o que a Dalila escolheu sozinha), o que já saiu e a fila dela. Clicar num post abre a tela de dia, hora e legenda (a mesma de Programados). */
export function ProgramacaoDalila({ clienteId, onProgramar }: { clienteId: string; onProgramar: (tipo: "carrossel" | "reel", tarefaId: string) => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [agenda, setAgenda] = useState<ItemAgenda[]>([]);
  const [tarefas, setTarefas] = useState<TarefaDalila[]>([]);
  const [temInstagram, setTemInstagram] = useState<boolean | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "carrossel" | "reel">("todos");

  const ler = useCallback(async () => {
    const [cars, reels, ag, ig, dal] = await Promise.all([
      db.from("carrosseis").select("id, numero, tema, status, programado_para, publicado_em, paginas, tarefa_data_id, programado_pela_dalila_em")
        .eq("cliente_id", clienteId).in("status", ["programado", "publicando", "publicado"]).order("programado_para", { ascending: false }).limit(60),
      db.from("reels").select("id, titulo, status, programado_para, publicado_em, tarefa_data_id, programado_pela_dalila_em")
        .eq("cliente_id", clienteId).in("status", ["programado", "publicando", "publicado"]).order("programado_para", { ascending: false }).limit(60),
      carregarAgenda(clienteId),
      instagramDoProjeto(clienteId),
      db.from("membros").select("id").eq("cliente_id", clienteId).ilike("nome", "dalila").limit(1),
    ]);
    const lista: Post[] = [
      ...((cars.data || []) as { id: string; numero: number | null; tema: string; status: string; programado_para: string | null; publicado_em: string | null; paginas: string[] | null; tarefa_data_id: string | null; programado_pela_dalila_em: string | null }[])
        .map((c) => ({ tipo: "carrossel" as const, id: c.id, titulo: `${c.numero ? `${String(c.numero).padStart(3, "0")} · ` : ""}${c.tema}`, status: c.status, quando: c.publicado_em ?? c.programado_para, tarefaId: c.tarefa_data_id, pelaDalila: !!c.programado_pela_dalila_em, capa: c.paginas?.[0] ?? null })),
      ...((reels.data || []) as { id: string; titulo: string; status: string; programado_para: string | null; publicado_em: string | null; tarefa_data_id: string | null; programado_pela_dalila_em: string | null }[])
        .map((r) => ({ tipo: "reel" as const, id: r.id, titulo: r.titulo, status: r.status, quando: r.publicado_em ?? r.programado_para, tarefaId: r.tarefa_data_id, pelaDalila: !!r.programado_pela_dalila_em, capa: null })),
    ];
    setPosts(lista); setAgenda(ag); setTemInstagram(!!ig);
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

  if (posts === null) return <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" />;
  const tile = (Icone: typeof Send, valor: number, rotulo: string, cor: string, fundo: string) => (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1320] px-4 py-3.5">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", fundo)}><Icone className={cn("h-5 w-5", cor)} /></span>
      <span><span className={cn("block text-2xl font-bold leading-none tabular-nums", cor)}>{valor}</span><span className="text-xs text-white/60">{rotulo}</span></span>
    </div>);
  const linha = (p: Post) => {
    const clicavel = !!p.tarefaId && p.status === "programado";
    return (
      <button key={p.tipo + p.id} type="button" disabled={!clicavel} onClick={() => p.tarefaId && onProgramar(p.tipo, p.tarefaId)}
        title={clicavel ? "Mudar dia, hora ou legenda" : p.status === "publicando" ? "Publicando agora" : undefined}
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile(CalendarDays, contagem.programados, "Programados", "text-cyan-300", "bg-cyan-500/15")}
        {tile(Send, contagem.hoje, "Saem hoje", "text-amber-300", "bg-amber-500/15")}
        {tile(Sparkles, contagem.dalila, "Dalila escolheu o dia", "text-pink-300", "bg-pink-500/15")}
        {tile(CheckCircle2, contagem.semana, "Publicados na semana", "text-emerald-300", "bg-emerald-500/15")}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-white/10 bg-[#0c1320] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5 text-cyan-300" />Calendário (5 semanas)</h3>
          <CalendarioPosts agenda={agenda} />
        </section>
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
