import { Fragment, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Clapperboard, Clock, Film, ListChecks, Loader2, MessageCircle, Pencil, Send, Timer, UserSearch, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { atividadeDanilo, horasMediaDeEdicao, ORDEM_DANILO, resumirDanilo, ROTULO_DANILO, type EdicaoVideo, type EtapaDanilo } from "@/lib/empresa/dashDanilo";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { prontosParados } from "@/lib/empresa/dashDark";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const MAX_CARTOES = 7;
const painel = "rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1b27] to-[#08121c]";
interface TarefaDanilo { id: string; titulo: string; data_vencimento: string | null }

const COR: Record<EtapaDanilo, { Icone: typeof Layers; texto: string; chip: string; ponto: string }> = {
  fila: { Icone: Clock, texto: "text-orange-300", chip: "bg-white/10 text-white/70", ponto: "bg-white/40" },
  criando: { Icone: Pencil, texto: "text-yellow-300", chip: "bg-yellow-500/20 text-yellow-300", ponto: "bg-yellow-400" },
  edicao: { Icone: Film, texto: "text-sky-300", chip: "bg-sky-500/20 text-sky-300", ponto: "bg-sky-400" },
  revisao: { Icone: UserSearch, texto: "text-violet-300", chip: "bg-violet-500/25 text-violet-200", ponto: "bg-violet-400" },
  pronto: { Icone: CheckCircle2, texto: "text-emerald-300", chip: "bg-emerald-500/20 text-emerald-300", ponto: "bg-emerald-400" },
  programado: { Icone: CalendarDays, texto: "text-cyan-300", chip: "bg-cyan-500/20 text-cyan-300", ponto: "bg-cyan-400" },
  postado: { Icone: Send, texto: "text-pink-300", chip: "bg-pink-500/20 text-pink-300", ponto: "bg-pink-400" },
};

/** Esteira de edição do Danilo (abre ao clicar nele): KPIs por etapa, vídeos em cadeia por formato, insights, atividade recente e a fila dele. */
export function DashDanilo({ membro, aberto, onFechar, onConversar, escritorioId }: {
  membro: MembroResumo | null; aberto: boolean; onFechar: () => void; onConversar: () => void; escritorioId: string | null;
}) {
  const [edicoes, setEdicoes] = useState<EdicaoVideo[] | null>(null);
  const [tarefas, setTarefas] = useState<TarefaDanilo[]>([]);
  const [erro, setErro] = useState(false);
  const [historico, setHistorico] = useState(false);

  useEffect(() => {
    if (!aberto || !membro || !escritorioId) return;
    let vivo = true;
    setEdicoes(null); setErro(false); setHistorico(false);
    (async () => {
      const { data, error } = await db.from("edicoes_video").select("id, titulo, status, formato, cliente_id, criado_em, atualizado_em, video_vertical_id")
        .eq("cliente_id", escritorioId).or("formato.is.null,formato.neq.dark").order("atualizado_em", { ascending: false }).limit(400);
      if (!vivo) return;
      if (error) { setErro(true); return; }
      const lista = (data || []) as (Omit<EdicaoVideo, "video_status" | "data_postagem"> & { video_vertical_id: string | null })[];
      const ids = lista.map((e) => e.video_vertical_id).filter((x): x is string => !!x);
      const [vid, tar] = await Promise.all([
        ids.length ? db.from("videos_vertical").select("id, status, data_postagem").in("id", ids) : { data: [] },
        db.from("atividades").select("id, titulo, data_vencimento").eq("responsavel_id", membro.id).is("deleted_at", null).eq("concluida", false).order("data_vencimento", { nullsFirst: false }),
      ]);
      if (!vivo) return;
      const videos = new Map(((vid.data || []) as { id: string; status: string; data_postagem: string | null }[]).map((v) => [v.id, v]));
      setEdicoes(lista.map((e) => { const v = e.video_vertical_id ? videos.get(e.video_vertical_id) : undefined; return { ...e, video_status: v?.status ?? null, data_postagem: v?.data_postagem ?? null }; }));
      setTarefas((tar.data || []) as TarefaDanilo[]);
    })();
    return () => { vivo = false; };
  }, [aberto, membro, escritorioId]);

  const hoje = hojeBrasilia();
  const resumo = useMemo(() => (edicoes ? resumirDanilo(edicoes, hoje) : null), [edicoes, hoje]);
  const atividade = useMemo(() => (edicoes ? atividadeDanilo(edicoes, hoje, historico ? 30 : 5) : []), [edicoes, hoje, historico]);
  const media = edicoes ? horasMediaDeEdicao(edicoes, new Date()) : null;
  const parados = edicoes ? prontosParados(edicoes.map((e) => ({ ...e, perfil: "" })), hoje, new Date()) : 0;
  const emAndamento = resumo ? resumo.geral.fila + resumo.geral.criando + resumo.geral.edicao + resumo.geral.revisao : 0;
  const textoMedia = media === null ? "—" : media >= 24 ? `${Math.round((media / 24) * 10) / 10} dias` : `${media} h`;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="dark max-h-[92vh] w-[96vw] max-w-[1240px] overflow-y-auto border-white/10 bg-[#060d16] p-5 text-white sm:p-6 [&>button]:text-white/70">
        <DialogDescription className="sr-only">Esteira de edição de vídeo do Danilo</DialogDescription>
        {erro ? <><DialogTitle className="sr-only">Edição de vídeos</DialogTitle><p className="text-sm text-rose-300">Não consegui carregar as edições agora.</p></>
          : !resumo ? <><DialogTitle className="sr-only">Edição de vídeos</DialogTitle><Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" /></> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30"><Clapperboard className="h-7 w-7" /></span>
              <div className="min-w-0 flex-1"><DialogTitle className="text-3xl font-bold tracking-tight">Edição de vídeos</DialogTitle><p className="text-sm text-white/55">Esteira de edição do {membro?.nome}: do bruto até o vídeo postado</p></div>
              <button type="button" onClick={onConversar} className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-sm font-medium text-white/80 hover:bg-white/10"><MessageCircle className="h-4 w-4" />Conversar com o {membro?.nome}</button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {ORDEM_DANILO.map((k) => { const { Icone, texto } = COR[k]; return (
                <div key={k} className={cn(painel, "flex flex-col items-center gap-1 px-3 py-4")}>
                  <div className="flex items-center gap-2.5"><Icone className={cn("h-6 w-6", texto)} /><span className={cn("text-4xl font-bold tabular-nums", texto)}>{resumo.geral[k]}</span></div>
                  <p className="text-sm text-white/80">{ROTULO_DANILO[k]}</p>
                </div>); })}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
              <section className={cn(painel, "p-4")}>
                <div className="flex items-center gap-3"><Layers className="h-6 w-6 text-sky-300" /><h3 className="text-xl font-bold">Esteira por formato</h3></div>
                {resumo.linhas.length === 0 ? <p className="mt-6 rounded-xl bg-white/5 p-8 text-center text-sm text-white/50">Nenhum vídeo em edição ainda. Quando o Danilo pegar um bruto, ele aparece aqui.</p> : (
                  <div className="mt-3 space-y-3">
                    {resumo.linhas.map((l) => {
                      const ativos = l.videos.filter((v) => v.etapa !== "postado");
                      const cartoes = ativos.slice(0, MAX_CARTOES), resto = ativos.length - cartoes.length;
                      return (
                        <div key={l.id} className="flex items-stretch gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="flex w-36 shrink-0 flex-col justify-center gap-1">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30"><Film className="h-5 w-5" /></span>
                            <p className="text-lg font-bold leading-tight">{l.nome}</p>
                            <p className="text-xs text-white/50">{l.ativos} {l.ativos === 1 ? "vídeo" : "vídeos"} na esteira</p>
                          </div>
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
                            {cartoes.map((v, i) => { const c = COR[v.etapa]; return (
                              <Fragment key={v.id}>
                                {i > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-white/35" />}
                                <div className="flex w-36 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-[#0d1a26] p-2.5" title={v.titulo}>
                                  <span className="flex items-start gap-1.5 text-sm font-semibold leading-tight"><Film className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/60" /><span className="line-clamp-2">{v.titulo}</span></span>
                                  <span className={cn("flex items-center gap-1 self-start rounded-lg px-2 py-0.5 text-[11px] font-semibold", c.chip)}><c.Icone className="h-3 w-3" />{ROTULO_DANILO[v.etapa]}</span>
                                </div>
                              </Fragment>); })}
                            {cartoes.length === 0 && <span className="px-2 text-xs text-white/40">Nada na esteira agora.</span>}
                            {resto > 0 && <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/60">+{resto}</span>}
                            <span className="mx-1 h-14 shrink-0 border-l border-dashed border-white/25" />
                            <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-xl border border-pink-400/50 bg-pink-500/10 p-2 text-center">
                              <Send className="h-5 w-5 text-pink-300" /><p className="text-sm font-bold">Postados</p><p className="text-xs text-white/60">{l.postados} {l.postados === 1 ? "vídeo" : "vídeos"}</p>
                            </div>
                          </div>
                        </div>); })}
                  </div>)}
              </section>

              <aside className="space-y-4">
                <section className={cn(painel, "p-4")}>
                  <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-white/70" /><h3 className="text-lg font-bold">Insights da edição</h3></div>
                  <div className="mt-3 space-y-2">
                    {([[Film, "Vídeos em andamento", String(emAndamento), "text-sky-300"], [UserSearch, "Esperando sua revisão", String(resumo.geral.revisao), "text-violet-300"],
                      [Timer, "Tempo médio de edição (30 dias)", textoMedia, "text-yellow-300"], [CheckCircle2, "Prontos parados há 7+ dias", String(parados), parados > 0 ? "text-rose-300" : "text-emerald-300"]] as const).map(([Icone, rot, val, cor]) => (
                      <div key={rot} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><Icone className="h-5 w-5 text-white/60" /><span className="flex-1 text-sm">{rot}</span><span className={cn("text-lg font-bold tabular-nums", cor)}>{val}</span></div>))}
                  </div>
                </section>

                <section className={cn(painel, "p-4")}>
                  <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-white/70" /><h3 className="text-lg font-bold">Atividade recente</h3></div>
                  {atividade.length === 0 ? <p className="mt-3 text-sm text-white/50">Ainda sem movimento.</p> : (
                    <ol className={cn("mt-3 space-y-3 border-l border-white/10 pl-4", historico && "max-h-80 overflow-y-auto pr-1")}>
                      {atividade.map((a) => (
                        <li key={a.id} className="relative text-sm">
                          <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-[#0a1520]", COR[a.etapa].ponto)} />
                          <p className="leading-snug">Vídeo “<span className="font-medium">{a.titulo}</span>” <span className="text-white/75">{a.frase}</span></p>
                          <p className="text-xs text-white/45">{formatDistanceToNowStrict(new Date(a.quando), { locale: ptBR, addSuffix: true })}</p>
                        </li>))}
                    </ol>)}
                  <button type="button" onClick={() => setHistorico((h) => !h)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-400/40 py-2 text-sm text-sky-200 hover:bg-sky-400/10">
                    {historico ? "Mostrar menos" : "Ver histórico completo"}{historico ? <ChevronDown className="h-4 w-4 rotate-180" /> : <ArrowRight className="h-4 w-4" />}</button>
                </section>

                {tarefas.length > 0 && (
                  <section className={cn(painel, "p-4")}>
                    <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-white/70" /><h3 className="text-lg font-bold">Fila do {membro?.nome}</h3></div>
                    <ul className="mt-2 space-y-1.5">
                      {tarefas.map((t) => (<li key={t.id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                        {t.data_vencimento && <span className="shrink-0 text-xs text-white/45">{t.data_vencimento.split("-").reverse().slice(0, 2).join("/")}</span>}</li>))}
                    </ul>
                  </section>)}
              </aside>
            </div>
          </div>)}
      </DialogContent>
    </Dialog>
  );
}
