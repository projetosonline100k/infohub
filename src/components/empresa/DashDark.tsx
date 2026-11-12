import { Fragment, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Clock, Layers, ListChecks, Loader2, MessageCircle, Pencil, Play, Settings, Sparkles, UserRound, UserSearch, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  atividadeRecente, ordenarPerfis, prontosParados, resumirEsteira, ROTULO_ETAPA, tituloCurto,
  type EdicaoDark, type EtapaEsteira, type OrdemPerfis,
} from "@/lib/empresa/dashDark";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

// Esteira dos vídeos dark (abre ao clicar no Lauro; 12/11/2026, Davi: "preciso que o dash do Lauro seja assim": KPIs por etapa, esteira por
// perfil com os vídeos em cadeia até "Programados", insights e atividade recente). Lê as edições de formato "dark" de todos os projetos.
interface TarefaLauro { id: string; titulo: string; data_vencimento: string | null; situacao: string | null }
type Etapa = Exclude<EtapaEsteira, "cancelado" | "postado">;
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const MAX_CARTOES = 6;

const KPIS: { chave: Etapa; Icone: typeof Layers; cor: string }[] = [
  { chave: "fila", Icone: Layers, cor: "text-orange-300" },
  { chave: "criando", Icone: Sparkles, cor: "text-yellow-300" },
  { chave: "edicao", Icone: Pencil, cor: "text-sky-300" },
  { chave: "revisao", Icone: UserSearch, cor: "text-violet-300" },
  { chave: "pronto", Icone: CheckCircle2, cor: "text-emerald-300" },
  { chave: "programado", Icone: CalendarDays, cor: "text-cyan-300" },
];
const ROTULO_KPI: Record<Etapa, string> = { fila: "Na fila", criando: "Sendo criado", edicao: "Em edição", revisao: "Em revisão", pronto: "Prontos", programado: "Programados" };
const CHIP: Record<Etapa, { Icone: typeof Layers; cor: string }> = {
  fila: { Icone: Clock, cor: "bg-white/10 text-white/70" },
  criando: { Icone: Settings, cor: "bg-yellow-500/20 text-yellow-300" },
  edicao: { Icone: Pencil, cor: "bg-sky-500/20 text-sky-300" },
  revisao: { Icone: UserSearch, cor: "bg-violet-500/25 text-violet-200" },
  pronto: { Icone: CheckCircle2, cor: "bg-emerald-500/20 text-emerald-300" },
  programado: { Icone: CalendarDays, cor: "bg-cyan-500/20 text-cyan-300" },
};
const PONTO: Record<EtapaEsteira, string> = { fila: "bg-white/40", criando: "bg-yellow-400", edicao: "bg-sky-400", revisao: "bg-violet-400", pronto: "bg-emerald-400", programado: "bg-cyan-400", postado: "bg-white/50", cancelado: "bg-white/20" };
const painel = "rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1b27] to-[#08121c]";

export function DashDark({ membro, aberto, onFechar, onConversar }: {
  membro: MembroResumo | null; aberto: boolean; onFechar: () => void; onConversar: () => void;
}) {
  const [edicoes, setEdicoes] = useState<EdicaoDark[] | null>(null);
  const [tarefas, setTarefas] = useState<TarefaLauro[]>([]);
  const [erro, setErro] = useState(false);
  const [ordem, setOrdem] = useState<OrdemPerfis>("nome");
  const [historico, setHistorico] = useState(false);

  useEffect(() => {
    if (!aberto || !membro) return;
    let vivo = true;
    setEdicoes(null); setErro(false); setHistorico(false);
    (async () => {
      const { data: eds, error } = await db.from("edicoes_video")
        .select("id, titulo, status, cliente_id, criado_em, atualizado_em, video_vertical_id").eq("formato", "dark").order("atualizado_em", { ascending: false });
      if (!vivo) return;
      if (error) { setErro(true); return; }
      const lista = (eds || []) as (Omit<EdicaoDark, "perfil" | "video_status" | "data_postagem"> & { video_vertical_id: string | null })[];
      const clienteIds = [...new Set(lista.map((e) => e.cliente_id))];
      const videoIds = lista.map((e) => e.video_vertical_id).filter((x): x is string => !!x);
      const [cli, vid, tar] = await Promise.all([
        clienteIds.length ? db.from("clientes").select("id, nome_especialista").in("id", clienteIds) : { data: [] },
        videoIds.length ? db.from("videos_vertical").select("id, status, data_postagem").in("id", videoIds) : { data: [] },
        db.from("atividades").select("id, titulo, data_vencimento, situacao").eq("responsavel_id", membro.id).is("deleted_at", null).eq("concluida", false).order("data_vencimento", { nullsFirst: false }),
      ]);
      if (!vivo) return;
      const nomes = new Map(((cli.data || []) as { id: string; nome_especialista: string }[]).map((c) => [c.id, c.nome_especialista]));
      const videos = new Map(((vid.data || []) as { id: string; status: string; data_postagem: string | null }[]).map((v) => [v.id, v]));
      setEdicoes(lista.map((e) => {
        const v = e.video_vertical_id ? videos.get(e.video_vertical_id) : undefined;
        return { id: e.id, titulo: e.titulo, status: e.status, cliente_id: e.cliente_id, criado_em: e.criado_em, atualizado_em: e.atualizado_em,
          perfil: nomes.get(e.cliente_id) ?? "Sem perfil", video_status: v?.status ?? null, data_postagem: v?.data_postagem ?? null };
      }));
      setTarefas((tar.data || []) as TarefaLauro[]);
    })();
    return () => { vivo = false; };
  }, [aberto, membro]);

  const hoje = hojeBrasilia();
  const resumo = useMemo(() => (edicoes ? resumirEsteira(edicoes, hoje) : null), [edicoes, hoje]);
  const perfis = useMemo(() => (resumo ? ordenarPerfis(resumo.porPerfil, ordem) : []), [resumo, ordem]);
  const parados = edicoes ? prontosParados(edicoes, hoje, new Date()) : 0;
  const atividade = useMemo(() => (edicoes ? atividadeRecente(edicoes, hoje, historico ? 30 : 5) : []), [edicoes, hoje, historico]);
  const emAndamento = resumo ? resumo.geral.fila + resumo.geral.criando + resumo.geral.edicao + resumo.geral.revisao : 0;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="dark max-h-[92vh] w-[96vw] max-w-[1240px] overflow-y-auto border-white/10 bg-[#060d16] p-5 text-white sm:p-6 [&>button]:text-white/70">
        <DialogDescription className="sr-only">Esteira dos vídeos dark por perfil</DialogDescription>
        {erro ? <><DialogTitle className="sr-only">Vídeos Dark</DialogTitle><p className="text-sm text-rose-300">Não consegui carregar os vídeos agora.</p></>
          : !resumo ? <><DialogTitle className="sr-only">Vídeos Dark</DialogTitle><Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" /></> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30"><Play className="h-7 w-7" /></span>
              <div className="min-w-0 flex-1"><DialogTitle className="text-3xl font-bold tracking-tight">Vídeos Dark</DialogTitle><p className="text-sm text-white/55">Esteira dinâmica de produção por perfil.</p></div>
              <button type="button" onClick={onConversar} className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-sm font-medium text-white/80 hover:bg-white/10"><MessageCircle className="h-4 w-4" />Conversar com o {membro?.nome}</button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {KPIS.map(({ chave, Icone, cor }) => (
                <div key={chave} className={cn(painel, "flex flex-col items-center gap-1 px-3 py-4")}>
                  <div className="flex items-center gap-2.5"><Icone className={cn("h-6 w-6", cor)} /><span className={cn("text-4xl font-bold tabular-nums", cor)}>{resumo.geral[chave]}</span></div>
                  <p className="text-sm text-white/80">{ROTULO_KPI[chave]}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
              <section className={cn(painel, "p-4")}>
                <div className="flex flex-wrap items-center gap-3">
                  <Layers className="h-6 w-6 text-cyan-300" /><h3 className="text-xl font-bold">Esteira por perfil</h3>
                  <label className="ml-auto flex items-center gap-2 rounded-xl border border-white/15 px-3 py-1.5 text-sm text-white/70">Ordenar por:
                    <select value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemPerfis)} className="bg-transparent text-white outline-none">
                      <option value="nome" className="bg-[#0a1520]">Nome do perfil</option><option value="videos" className="bg-[#0a1520]">Mais vídeos</option><option value="recente" className="bg-[#0a1520]">Mais recente</option>
                    </select></label>
                </div>
                {perfis.length === 0 ? <p className="mt-6 rounded-xl bg-white/5 p-8 text-center text-sm text-white/50">Nenhum vídeo dark na esteira agora.</p> : (
                  <div className="mt-3 space-y-3">
                    {perfis.map((p) => {
                      const cartoes = p.videos.slice(0, MAX_CARTOES), resto = p.videos.length - cartoes.length;
                      return (
                        <div key={p.cliente_id} className="flex items-stretch gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="flex w-36 shrink-0 flex-col justify-center gap-1">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30"><UserRound className="h-5 w-5" /></span>
                            <p className="truncate text-lg font-bold" title={p.perfil}>{p.perfil}</p>
                            <p className="text-xs text-white/50">{p.ativos} {p.ativos === 1 ? "vídeo" : "vídeos"} na esteira</p>
                          </div>
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
                            {cartoes.map((v, i) => {
                              const c = CHIP[v.etapa as Etapa];
                              return (
                                <Fragment key={v.id}>
                                  {i > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-white/35" />}
                                  <div className="flex w-36 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-[#0d1a26] p-2.5" title={tituloCurto(v.titulo, p.perfil)}>
                                    <span className="flex items-start gap-1.5 text-sm font-semibold leading-tight"><Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/60" /><span className="line-clamp-2">{tituloCurto(v.titulo, p.perfil)}</span></span>
                                    <span className={cn("flex items-center gap-1 self-start rounded-lg px-2 py-0.5 text-[11px] font-semibold", c.cor)}><c.Icone className="h-3 w-3" />{ROTULO_ETAPA[v.etapa]}</span>
                                  </div>
                                </Fragment>
                              );
                            })}
                            {resto > 0 && <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/60">+{resto}</span>}
                            <span className="mx-1 h-14 shrink-0 border-l border-dashed border-white/25" />
                            <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-xl border border-cyan-400/50 bg-cyan-500/10 p-2 text-center">
                              <CalendarDays className="h-5 w-5 text-cyan-300" /><p className="text-sm font-bold">Programados</p><p className="text-xs text-white/60">{p.programados} {p.programados === 1 ? "vídeo" : "vídeos"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <aside className="space-y-4">
                <section className={cn(painel, "p-4")}>
                  <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-white/70" /><h3 className="text-lg font-bold">Insights da esteira</h3></div>
                  <div className="mt-3 space-y-2">
                    {([[Users, "Perfis ativos", resumo.porPerfil.length, "text-white"], [Play, "Vídeos em andamento", emAndamento, "text-cyan-300"], [UserSearch, "Precisam de revisão", resumo.geral.revisao, "text-violet-300"], [CheckCircle2, "Prontos há mais de 7 dias", parados, parados ? "text-amber-300" : "text-white"], [CalendarDays, "Já postados", resumo.geral.postado, "text-white"]] as const).map(([Icone, rot, v, cor]) => (
                      <div key={rot} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><Icone className="h-5 w-5 text-white/60" /><span className="flex-1 text-sm">{rot}</span><span className={cn("text-xl font-bold tabular-nums", cor)}>{v}</span></div>
                    ))}
                  </div>
                </section>

                <section className={cn(painel, "p-4")}>
                  <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-white/70" /><h3 className="text-lg font-bold">Atividade recente</h3></div>
                  {atividade.length === 0 ? <p className="mt-3 text-sm text-white/50">Ainda sem movimento.</p> : (
                    <ol className={cn("mt-3 space-y-3 border-l border-white/10 pl-4", historico && "max-h-80 overflow-y-auto pr-1")}>
                      {atividade.map((a) => (
                        <li key={a.id} className="relative text-sm">
                          <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-[#0a1520]", PONTO[a.etapa])} />
                          <p className="leading-snug">Vídeo “<span className="font-medium">{a.titulo}</span>” ({a.perfil}) <span className="text-white/75">{a.frase}</span></p>
                          <p className="text-xs text-white/45">{formatDistanceToNowStrict(new Date(a.quando), { locale: ptBR, addSuffix: true })}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                  <button type="button" onClick={() => setHistorico((h) => !h)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 py-2 text-sm text-cyan-200 hover:bg-cyan-400/10">
                    {historico ? "Mostrar menos" : "Ver histórico completo"}{historico ? <ChevronDown className="h-4 w-4 rotate-180" /> : <ArrowRight className="h-4 w-4" />}
                  </button>
                </section>

                {tarefas.length > 0 && (
                  <section className={cn(painel, "p-4")}>
                    <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-white/70" /><h3 className="text-lg font-bold">Fila do {membro?.nome}</h3></div>
                    <ul className="mt-2 space-y-1.5">
                      {tarefas.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                          {t.data_vencimento && <span className="shrink-0 text-xs text-white/45">{t.data_vencimento.split("-").reverse().slice(0, 2).join("/")}</span>}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </aside>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
