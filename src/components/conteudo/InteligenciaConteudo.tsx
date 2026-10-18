import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Bookmark, CalendarClock, Clapperboard, Eye, GalleryHorizontal, Heart, Sparkles, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { numeroCurto, tituloDoPost } from "@/lib/instagramMetricas";
import {
  engajamento, filaProgramada, porFormato, resumoRapido, separarPeriodos, seguidoresNoPeriodo, serieDiaria, somar, variacao,
  type DiaConta, type PostMetricas,
} from "@/lib/conteudo/inteligencia";

// "Inteligência de Conteúdo" no topo do Cronograma (pedido do Davi, 17/10/2026, com a imagem
// de referência): números do período contra o anterior, evolução, formato, os que mais
// cresceram, a fila programada e a lista do que vai sair. Contas em src/lib/conteudo/inteligencia.ts.
export interface ProgramadoResumo {
  id: string; tipo: "carrossel" | "reel"; titulo: string; status: string; quando: string;
  permalink: string | null; capa: string | null; video: string | null; videoId?: string | null;
}

const COR_ATUAL = "#0ea5e9";      // sky-500
const COR_ANTERIOR = "#94a3b8";   // slate-400
const COR_REELS = "#8b5cf6";      // violet-500
const COR_CARROSSEL = "#f59e0b";  // amber-500

function Delta({ valor, sufixo = "%" }: { valor: number | null; sufixo?: string }) {
  if (valor == null || !isFinite(valor)) return <span className="text-[11px] text-muted-foreground">sem período anterior</span>;
  const sobe = valor >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", sobe ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
      {sobe ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {sobe ? "+" : ""}{valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{sufixo} <span className="font-normal text-muted-foreground">vs anterior</span>
    </span>
  );
}

function Kpi({ icone: Icone, rotulo, valor, delta, serie, deltaSufixo }: {
  icone: typeof Eye; rotulo: string; valor: string; delta: number | null; serie: number[]; deltaSufixo?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icone className="h-3.5 w-3.5" />{rotulo}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight">{valor}</p>
          <Delta valor={delta} sufixo={deltaSufixo} />
        </div>
        {serie.length > 1 && (
          <div className="h-10 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Area type="monotone" dataKey="v" stroke={COR_ATUAL} strokeWidth={2} fill={COR_ATUAL} fillOpacity={0.12} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export function InteligenciaConteudo({ clienteId, posts, programados, tituloDoCard, metricaDe }: {
  clienteId: string; posts: PostMetricas[]; programados: ProgramadoResumo[];
  tituloDoCard: (p: PostMetricas) => string | null; metricaDe: (p: ProgramadoResumo) => PostMetricas | undefined;
}) {
  const [dias, setDias] = useState(30);
  const [comparar, setComparar] = useState(true);
  const [aba, setAba] = useState<"visualizacoes" | "alcance" | "seguidores">("visualizacoes");
  const [filtro, setFiltro] = useState<"todos" | "reel" | "carrossel">("todos");
  const [conta, setConta] = useState<DiaConta[]>([]);

  useEffect(() => {
    void supabase.from("instagram_metricas_diarias").select("dia, seguidores, alcance, visualizacoes").eq("cliente_id", clienteId).order("dia")
      .then(({ data }) => setConta((data || []) as DiaConta[]));
  }, [clienteId]);

  const calc = useMemo(() => {
    const { atual, anterior } = separarPeriodos(posts, dias);
    const views = somar(atual, "visualizacoes"), viewsAnt = somar(anterior, "visualizacoes");
    const alc = somar(atual, "alcance"), alcAnt = somar(anterior, "alcance");
    const eng = engajamento(atual), engAnt = engajamento(anterior);
    const seg = seguidoresNoPeriodo(conta, dias);
    const segAnt = seguidoresNoPeriodo(conta.filter((d) => d.dia < (seg.desde ?? "9999")), dias);
    const serieV = serieDiaria(posts, dias, "visualizacoes");
    const serieA = serieDiaria(posts, dias, "alcance");
    const formato = porFormato(atual);
    const top = [...atual].sort((a, b) => (b.visualizacoes ?? 0) - (a.visualizacoes ?? 0)).slice(0, 5);
    const fila = filaProgramada(programados);
    const titulo = (p: PostMetricas) => tituloDoCard(p) ?? tituloDoPost(p);
    return {
      views, viewsAnt, alc, alcAnt, eng, engAnt, seg, segAnt, serieV, serieA, formato, top, fila, titulo,
      resumo: resumoRapido({
        visualizacoes: views, varVisualizacoes: variacao(views, viewsAnt), formato, ganhoSeguidores: seg.ganho,
        melhor: top[0] ? { titulo: titulo(top[0]), visualizacoes: top[0].visualizacoes ?? 0 } : null, fila,
      }),
    };
  }, [posts, dias, conta, programados, tituloDoCard]);

  const serieGrafico = aba === "seguidores"
    ? calc.seg.serie.map((d) => ({ dia: d.dia, atual: d.seguidores ?? 0, anterior: null as number | null }))
    : (aba === "visualizacoes" ? calc.serieV : calc.serieA).map((d) => ({ ...d, anterior: comparar ? d.anterior : null }));

  // Seu conteúdo programado: de ontem até os próximos 7 dias, por dia.
  const hoje = startOfDay(new Date());
  const lista = programados
    .filter((p) => filtro === "todos" || p.tipo === filtro)
    .filter((p) => { const d = parseISO(p.quando); return d >= addDays(hoje, -1) && d < addDays(hoje, 8); })
    .sort((a, b) => a.quando.localeCompare(b.quando));
  const diasLista = Array.from(new Set(lista.map((p) => p.quando.slice(0, 10))));

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" />Inteligência de Conteúdo</h3>
            <p className="text-xs text-muted-foreground">Instagram · dados reais dos posts e da conta</p>
          </div>
          <div className="flex rounded-lg bg-muted p-0.5 text-xs font-medium">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setDias(d)}
                className={cn("rounded-md px-2.5 py-1", dias === d ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>Últimos {d} dias</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />Comparar com o período anterior
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icone={Eye} rotulo="Visualizações" valor={numeroCurto(calc.views)} delta={comparar ? variacao(calc.views, calc.viewsAnt) : null} serie={calc.serieV.map((d) => d.atual)} />
          <Kpi icone={Users} rotulo="Contas alcançadas" valor={numeroCurto(calc.alc)} delta={comparar ? variacao(calc.alc, calc.alcAnt) : null} serie={calc.serieA.map((d) => d.atual)} />
          <Kpi icone={TrendingUp} rotulo={`Novos seguidores${calc.seg.desde ? ` (desde ${format(parseISO(calc.seg.desde), "dd/MM")})` : ""}`}
            valor={calc.seg.ganho == null ? "–" : `${calc.seg.ganho >= 0 ? "+" : ""}${calc.seg.ganho.toLocaleString("pt-BR")}`}
            delta={comparar && calc.seg.ganho != null && calc.segAnt.ganho ? variacao(calc.seg.ganho, calc.segAnt.ganho) : null}
            serie={calc.seg.serie.map((d) => d.seguidores ?? 0)} />
          <Kpi icone={Heart} rotulo="Engajamento médio" valor={calc.eng == null ? "–" : `${calc.eng.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            delta={comparar && calc.eng != null && calc.engAnt != null ? calc.eng - calc.engAnt : null} deltaSufixo=" p.p." serie={[]} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm font-semibold">Evolução do desempenho</p>
              <div className="flex rounded-lg bg-muted p-0.5 text-[11px] font-medium">
                {([["visualizacoes", "Visualizações"], ["alcance", "Alcance"], ["seguidores", "Seguidores"]] as const).map(([id, r]) => (
                  <button key={id} type="button" onClick={() => setAba(id)}
                    className={cn("rounded-md px-2 py-0.5", aba === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{r}</button>
                ))}
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieGrafico} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" tickFormatter={(d) => format(parseISO(d), "dd/MM")} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickFormatter={(v) => numeroCurto(v)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={48}
                    domain={aba === "seguidores" ? ["dataMin - 20", "dataMax + 20"] : [0, "auto"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(d) => format(parseISO(String(d)), "EEE, dd/MM", { locale: ptBR })}
                    formatter={(v: number, nome: string) => [Number(v).toLocaleString("pt-BR"), nome === "atual" ? "Período atual" : "Período anterior"]} />
                  {comparar && aba !== "seguidores" && <Line type="monotone" dataKey="anterior" stroke={COR_ANTERIOR} strokeWidth={2} strokeDasharray="4 4" dot={false} />}
                  <Line type="monotone" dataKey="atual" stroke={COR_ATUAL} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded" style={{ background: COR_ATUAL }} />Período atual</span>
              {comparar && aba !== "seguidores" && <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: COR_ANTERIOR }} />Período anterior</span>}
              {aba !== "seguidores" && <span className="ml-auto">pelo dia em que o post saiu</span>}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-3">
            <p className="mb-1 text-sm font-semibold">Distribuição por formato</p>
            <div className="relative h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ nome: "Reels", v: calc.formato.reels.visualizacoes }, { nome: "Carrosséis", v: calc.formato.carrosseis.visualizacoes }]}
                    dataKey="v" nameKey="nome" innerRadius="62%" outerRadius="88%" stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
                    <Cell fill={COR_REELS} /><Cell fill={COR_CARROSSEL} />
                  </Pie>
                  <Tooltip formatter={(v: number) => Number(v).toLocaleString("pt-BR")} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold">{numeroCurto(calc.formato.total)}</span>
                <span className="text-[10px] text-muted-foreground">visualizações</span>
              </div>
            </div>
            {([["Reels", calc.formato.reels, COR_REELS], ["Carrosséis", calc.formato.carrosseis, COR_CARROSSEL]] as const).map(([nome, f, cor]) => (
              <div key={nome} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />
                <span className="flex-1">{nome} <span className="text-muted-foreground">({f.quantidade})</span></span>
                <span className="font-medium">{calc.formato.total ? Math.round((f.visualizacoes / calc.formato.total) * 100) : 0}%</span>
                <span className="w-20 text-right text-muted-foreground">{numeroCurto(f.media)}/post</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 text-sm font-semibold">Conteúdos que mais performaram no período</p>
            {calc.top.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Sem posts com números neste período.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[11px] text-muted-foreground">
                  <th className="pb-1 font-medium">#</th><th className="pb-1 font-medium">Conteúdo</th><th className="pb-1 font-medium">Tipo</th>
                  <th className="pb-1 text-right font-medium">Visualizações</th><th className="pb-1 text-right font-medium">Salvos</th>
                </tr></thead>
                <tbody>
                  {calc.top.map((p, i) => (
                    <tr key={p.ig_media_id} className="border-t">
                      <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="max-w-0 py-1.5 pr-2">
                        <button type="button" disabled={!p.permalink} onClick={() => p.permalink && window.open(p.permalink, "_blank")} className="block w-full truncate text-left hover:underline">{calc.titulo(p)}</button>
                        <span className="text-[10px] text-muted-foreground">{format(parseISO(p.publicado_em), "dd/MM · HH:mm")}</span>
                      </td>
                      <td className="py-1.5 pr-2"><span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${(p.tipo ?? "").toUpperCase() === "REELS" ? COR_REELS : COR_CARROSSEL}22` }}>{(p.tipo ?? "").toUpperCase() === "REELS" ? "Reel" : "Carrossel"}</span></td>
                      <td className="py-1.5 text-right font-medium">{numeroCurto(p.visualizacoes)}</td>
                      <td className="py-1.5 text-right text-muted-foreground"><Bookmark className="mr-0.5 inline h-3 w-3" />{numeroCurto(p.salvamentos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4" />Fila programada</p>
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-20 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ v: calc.fila.pctMeta }, { v: 100 - calc.fila.pctMeta }]} dataKey="v" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                      <Cell fill={COR_ATUAL} /><Cell fill="hsl(var(--muted))" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{calc.fila.pctMeta}%</span>
              </div>
              <div className="space-y-1 text-xs">
                <p><b>{calc.fila.reels}</b> dia(s) de reels{calc.fila.ateReel ? ` · até ${format(parseISO(calc.fila.ateReel), "dd/MM")}` : ""}</p>
                <p><b>{calc.fila.carrosseis}</b> dia(s) de carrosséis{calc.fila.ateCarrossel ? ` · até ${format(parseISO(calc.fila.ateCarrossel), "dd/MM")}` : ""}</p>
                <p className="text-muted-foreground">meta: 30 dias de cada</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-sm font-semibold">Seu conteúdo programado</p>
          <div className="mb-2 flex rounded-lg bg-muted p-0.5 text-[11px] font-medium">
            {([["todos", "Todos"], ["reel", "Reels"], ["carrossel", "Carrosséis"]] as const).map(([id, r]) => (
              <button key={id} type="button" onClick={() => setFiltro(id)}
                className={cn("flex-1 rounded-md py-0.5", filtro === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{r}</button>
            ))}
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-0.5">
            {diasLista.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Nada programado nos próximos dias.</p>}
            {diasLista.map((d) => {
              const dia = parseISO(d);
              return (
                <div key={d}>
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                    {isSameDay(dia, hoje) ? "Hoje" : isSameDay(dia, addDays(hoje, 1)) ? "Amanhã" : isSameDay(dia, addDays(hoje, -1)) ? "Ontem" : ""} {format(dia, "EEEE, dd 'de' MMM", { locale: ptBR })}
                  </p>
                  {lista.filter((p) => p.quando.slice(0, 10) === d).map((p) => {
                    const m = metricaDe(p);
                    const publicado = p.status === "publicado";
                    return (
                      <button key={p.id} type="button" disabled={!p.permalink} onClick={() => p.permalink && window.open(p.permalink, "_blank")}
                        className="mb-1 flex w-full items-center gap-2 rounded-lg border p-1.5 text-left hover:bg-muted/50">
                        {p.capa ? <img src={p.capa} alt="" className="h-10 w-8 shrink-0 rounded object-cover" loading="lazy" />
                          : p.video ? <video src={`${p.video}#t=0.5`} muted playsInline preload="metadata" className="h-10 w-8 shrink-0 rounded bg-black object-cover" />
                          : <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded bg-muted">{p.tipo === "reel" ? <Clapperboard className="h-3.5 w-3.5" /> : <GalleryHorizontal className="h-3.5 w-3.5" />}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{p.titulo}</span>
                          <span className={cn("block text-[10.5px]", publicado ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                            {publicado ? "Publicado" : "Programado"} · {format(parseISO(p.quando), "HH:mm")}
                          </span>
                          {m && <span className="flex gap-2 text-[10px] text-muted-foreground"><span><Eye className="mr-0.5 inline h-2.5 w-2.5" />{numeroCurto(m.visualizacoes)}</span><span><Heart className="mr-0.5 inline h-2.5 w-2.5" />{numeroCurto(m.curtidas)}</span></span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {calc.resumo.length > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Resumo rápido</p>
            <ul className="space-y-1 text-xs">{calc.resumo.map((f, i) => <li key={i} className="flex gap-1.5"><span className="text-primary">•</span>{f}</li>)}</ul>
          </div>
        )}
      </aside>
    </section>
  );
}
