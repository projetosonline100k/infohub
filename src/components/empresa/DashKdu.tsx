import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, BarChart3, CheckCircle2, ExternalLink, Loader2, Megaphone, MessageCircle, MousePointerClick, RefreshCw, Target, TrendingUp, Wallet, Eye } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cpm, ctr, custoPorResultado, desdeDia, filtrar, porCampanha, retorno, semResultado, serieDiaria, totais, variacao, type MetricaDia, type Totais } from "@/lib/empresa/ads";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dinheiro = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const numero = (v: number | null, casas = 0) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas }));
const diaCurto = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const GERENCIADOR = "https://adsmanager.facebook.com/adsmanager/manage/campaigns";
const painel = "rounded-2xl border border-white/10 bg-[#0c1320]";

interface Campanha { campanha_ref: string; nome: string; status: string | null; objetivo: string | null; orcamento_diario: number | null; conta: string | null; atualizado_em: string }
interface Alerta { id: string; nivel: "info" | "atencao" | "critico"; titulo: string; detalhe: string | null; campanha_ref: string | null; criado_em: string }
interface Coleta { id: string; status: "pedida" | "coletando" | "ok" | "erro"; mensagem: string | null; pedida_em: string; concluida_em: string | null }
const PERIODOS = [{ dias: 1, rotulo: "Hoje" }, { dias: 7, rotulo: "7 dias" }, { dias: 14, rotulo: "14 dias" }, { dias: 30, rotulo: "30 dias" }];
const COR_STATUS: Record<string, string> = { ativa: "bg-emerald-500/15 text-emerald-300", pausada: "bg-white/10 text-white/60", arquivada: "bg-white/10 text-white/40", "com problema": "bg-rose-500/15 text-rose-300" };
const COR_ALERTA = { info: "border-sky-400/30 bg-sky-500/5 text-sky-100", atencao: "border-amber-400/40 bg-amber-500/5 text-amber-100", critico: "border-rose-400/50 bg-rose-500/10 text-rose-100" };

/** Dash do Kdu (gestor de tráfego, IA): números do Gerenciador de Anúncios do Facebook, que ele lê pelo Chrome do Davi e grava em ads_* (scripts/kdu/coletar.py). */
export function DashKdu({ membro, aberto, onFechar, onConversar, escritorioId }: {
  membro: MembroResumo | null; aberto: boolean; onFechar: () => void; onConversar: () => void; escritorioId: string | null;
}) {
  const [metricas, setMetricas] = useState<MetricaDia[] | null>(null);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [coleta, setColeta] = useState<Coleta | null>(null);
  const [dias, setDias] = useState(7);
  const [pedindo, setPedindo] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<"todas" | "ativa">("todas");

  const ler = useCallback(async () => {
    if (!escritorioId) return;
    const de = desdeDia(hojeBrasilia(), 60);
    const [m, c, a, k] = await Promise.all([
      db.from("ads_metricas_diarias").select("campanha_ref, dia, gasto, impressoes, cliques, resultados, valor_conversao").eq("cliente_id", escritorioId).gte("dia", de).limit(20000),
      db.from("ads_campanhas").select("campanha_ref, nome, status, objetivo, orcamento_diario, conta, atualizado_em").eq("cliente_id", escritorioId),
      db.from("ads_alertas").select("id, nivel, titulo, detalhe, campanha_ref, criado_em").eq("cliente_id", escritorioId).is("resolvido_em", null).order("criado_em", { ascending: false }).limit(30),
      db.from("ads_coletas").select("id, status, mensagem, pedida_em, concluida_em").eq("cliente_id", escritorioId).order("pedida_em", { ascending: false }).limit(1),
    ]);
    setMetricas(((m.data || []) as MetricaDia[]).map((x) => ({ ...x, gasto: +x.gasto, impressoes: +x.impressoes, cliques: +x.cliques, resultados: +x.resultados, valor_conversao: +x.valor_conversao })));
    setCampanhas((c.data || []) as Campanha[]); setAlertas((a.data || []) as Alerta[]); setColeta(((k.data || []) as Coleta[])[0] ?? null);
  }, [escritorioId]);
  useEffect(() => {
    if (!aberto) return;
    setMetricas(null); void ler();
    const t = window.setInterval(() => { if (!document.hidden) void ler(); }, 8000);
    return () => window.clearInterval(t);
  }, [aberto, ler]);

  const hoje = hojeBrasilia();
  const rodando = coleta?.status === "pedida" || coleta?.status === "coletando";
  const atual = useMemo(() => filtrar(metricas ?? [], desdeDia(hoje, dias)), [metricas, hoje, dias]);
  const anterior = useMemo(() => filtrar(metricas ?? [], desdeDia(hoje, dias * 2), desdeDia(hoje, dias + 1)), [metricas, hoje, dias]);
  const t = useMemo(() => totais(atual), [atual]);
  const tAnt = useMemo(() => totais(anterior), [anterior]);
  const serie = useMemo(() => serieDiaria(atual, desdeDia(hoje, Math.max(dias, 7)), hoje).map((p) => ({ ...p, rotulo: diaCurto(p.dia) })), [atual, hoje, dias]);
  const linhas = useMemo(() => {
    const por = porCampanha(atual);
    const nomes = new Map(campanhas.map((c) => [c.campanha_ref, c]));
    const refs = new Set([...por.keys(), ...(filtroStatus === "ativa" ? [] : campanhas.map((c) => c.campanha_ref))]);
    return [...refs].map((ref) => ({ ref, info: nomes.get(ref), t: por.get(ref) ?? ({ gasto: 0, impressoes: 0, cliques: 0, resultados: 0, valor: 0 } as Totais) }))
      .filter((l) => filtroStatus === "todas" || l.info?.status === "ativa")
      .sort((a, b) => b.t.gasto - a.t.gasto);
  }, [atual, campanhas, filtroStatus]);

  const pedir = async () => {
    if (!escritorioId || pedindo || rodando) return;
    setPedindo(true);
    const { error } = await db.from("ads_coletas").insert({ cliente_id: escritorioId, periodo_dias: 30, status: "pedida", origem: "manual" });
    setPedindo(false);
    if (error) { toast.error("Não consegui pedir a atualização"); return; }
    toast.success("Pedido enviado: o Kdu vai abrir o Gerenciador de Anúncios no seu Chrome");
    void ler();
  };
  const resolver = async (id: string) => {
    setAlertas((l) => l.filter((x) => x.id !== id));
    const { error } = await db.from("ads_alertas").update({ resolvido_em: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("Não consegui marcar como resolvido"); void ler(); }
  };

  const delta = (a: number, b: number, inverso = false) => {
    const v = variacao(a, b);
    if (v === null) return null;
    const bom = inverso ? v <= 0 : v >= 0;
    return <span className={cn("text-[11px] font-medium", bom ? "text-emerald-300" : "text-rose-300")}>{v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(0)}%</span>;
  };
  const tile = (Icone: typeof Wallet, rotulo: string, valor: string, sub: React.ReactNode, cor: string, fundo: string) => (
    <div className={cn(painel, "flex items-center gap-3 px-4 py-3.5")}>
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", fundo)}><Icone className={cn("h-5 w-5", cor)} /></span>
      <span className="min-w-0"><span className="block truncate text-2xl font-bold leading-none tabular-nums">{valor}</span><span className="text-xs text-white/60">{rotulo}</span>{sub && <span className="ml-1.5">{sub}</span>}</span>
    </div>);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="dark max-h-[92vh] w-[96vw] max-w-[1240px] overflow-y-auto border-white/10 bg-[#070b14] p-5 text-white sm:p-6 [&>button]:text-white/70">
        <DialogDescription className="sr-only">Facebook Ads: gasto, resultados e campanhas</DialogDescription>
        {metricas === null ? <><DialogTitle className="sr-only">Facebook Ads</DialogTitle><Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-white/50" /></> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-r from-[#0d1a35] via-[#12224a] to-[#1c2f6e] p-6">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-2xl font-bold tracking-tight">Facebook Ads · {membro?.nome}</DialogTitle>
                <p className="mt-1 text-sm text-white/65">O {membro?.nome} lê o Gerenciador de Anúncios pelo seu Chrome, traz gasto, resultados e custo por resultado de cada campanha e avisa o que está pedindo atenção. Ele só lê: não muda orçamento nem pausa nada.</p>
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <button type="button" onClick={() => void pedir()} disabled={pedindo || rodando} className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
                    {pedindo || rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{rodando ? (coleta?.status === "pedida" ? "Na fila do Kdu…" : "Kdu lendo o Gerenciador…") : "Atualizar agora"}</button>
                  <button type="button" onClick={() => void abrirLinkExterno(GERENCIADOR)} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"><ExternalLink className="h-4 w-4" />Abrir o Gerenciador</button>
                  <button type="button" onClick={onConversar} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"><MessageCircle className="h-4 w-4" />Conversar com o {membro?.nome}</button>
                </div>
                <p className={cn("mt-2 text-xs", coleta?.status === "erro" ? "text-rose-300" : "text-white/45")}>
                  {!coleta ? "Ainda não atualizei. Clique em Atualizar agora (o Facebook precisa estar logado no seu Chrome)."
                    : coleta.status === "erro" ? `A última atualização falhou: ${coleta.mensagem ?? "erro"}`
                    : coleta.status === "ok" ? `Atualizado ${formatDistanceToNowStrict(new Date(coleta.concluida_em ?? coleta.pedida_em), { locale: ptBR, addSuffix: true })}${coleta.mensagem ? ` · ${coleta.mensagem}` : ""}`
                    : coleta.mensagem ?? "Em andamento…"}</p>
              </div>
              <span className="hidden h-24 w-24 items-center justify-center rounded-3xl bg-white/5 ring-1 ring-white/10 sm:flex"><Megaphone className="h-12 w-12 text-sky-300" /></span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-white/10 bg-[#0c1320] p-0.5 text-sm">
                {PERIODOS.map((p) => <button key={p.dias} type="button" onClick={() => setDias(p.dias)} className={cn("rounded-lg px-3.5 py-1.5", dias === p.dias ? "bg-sky-500 font-semibold text-white" : "text-white/60 hover:text-white")}>{p.rotulo}</button>)}
              </div>
              <span className="text-xs text-white/40">comparado com os {dias === 1 ? "dias" : `${dias} dias`} anteriores</span>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {tile(Wallet, "Gasto", dinheiro(t.gasto), delta(t.gasto, tAnt.gasto, true), "text-white", "bg-white/10")}
              {tile(Target, "Resultados", numero(t.resultados), delta(t.resultados, tAnt.resultados), "text-emerald-300", "bg-emerald-500/15")}
              {tile(BarChart3, "Custo por resultado", dinheiro(custoPorResultado(t)), (() => { const a = custoPorResultado(t), b = custoPorResultado(tAnt); return a !== null && b !== null ? delta(a, b, true) : null; })(), "text-amber-300", "bg-amber-500/15")}
              {tile(TrendingUp, "Retorno (ROAS)", retorno(t) === null ? "—" : `${numero(retorno(t), 2)}x`, null, "text-violet-300", "bg-violet-500/15")}
              {tile(MousePointerClick, "CTR", ctr(t) === null ? "—" : `${numero(ctr(t), 2)}%`, null, "text-sky-300", "bg-sky-500/15")}
              {tile(Eye, "CPM", dinheiro(cpm(t)), null, "text-pink-300", "bg-pink-500/15")}
            </div>

            {alertas.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="h-5 w-5 text-amber-300" />Avisos do {membro?.nome} ({alertas.length})</h3>
                <div className="grid gap-2 lg:grid-cols-2">
                  {alertas.map((a) => (
                    <div key={a.id} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", COR_ALERTA[a.nivel])}>
                      <div className="min-w-0 flex-1"><p className="font-semibold">{a.titulo}</p>{a.detalhe && <p className="mt-0.5 text-xs opacity-80">{a.detalhe}</p>}
                        <p className="mt-1 text-[10px] opacity-50">{formatDistanceToNowStrict(new Date(a.criado_em), { locale: ptBR, addSuffix: true })}</p></div>
                      <button type="button" onClick={() => void resolver(a.id)} title="Marcar como resolvido" className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/10"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                    </div>))}
                </div>
              </section>)}

            <div className="grid gap-3 lg:grid-cols-2">
              {([["gasto", "Gasto por dia", "#38bdf8", true], ["resultados", "Resultados por dia", "#34d399", false]] as const).map(([chave, titulo, cor, dinheiroEixo]) => (
                <section key={chave} className={cn(painel, "p-4")}>
                  <h3 className="mb-2 text-sm font-bold text-white/80">{titulo}</h3>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serie} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="rotulo" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ background: "#0c1320", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: number) => [dinheiroEixo ? dinheiro(v) : numero(v), titulo.split(" por")[0]]} labelFormatter={(l) => `Dia ${l}`} />
                        <Bar dataKey={chave} fill={cor} radius={[3, 3, 0, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>))}
            </div>

            <section className={cn(painel, "p-4")}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-bold">Campanhas</h3>
                <div className="ml-auto flex rounded-xl border border-white/10 bg-black/20 p-0.5 text-xs">
                  {([["todas", "Todas"], ["ativa", "Só ativas"]] as const).map(([v, r]) => <button key={v} type="button" onClick={() => setFiltroStatus(v)} className={cn("rounded-lg px-3 py-1", filtroStatus === v ? "bg-sky-500 font-semibold text-white" : "text-white/60")}>{r}</button>)}
                </div>
              </div>
              {linhas.length === 0 ? (
                <p className="rounded-xl bg-white/5 p-8 text-center text-sm text-white/50">Nenhuma campanha ainda. Clique em <b>Atualizar agora</b> e o {membro?.nome} traz os números do Gerenciador de Anúncios (o Facebook precisa estar logado no seu Chrome).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wide text-white/40">
                      <th className="pb-2 pr-3 font-semibold">Campanha</th><th className="pb-2 pr-3 font-semibold">Status</th><th className="pb-2 pr-3 text-right font-semibold">Gasto</th><th className="pb-2 pr-3 text-right font-semibold">Resultados</th>
                      <th className="pb-2 pr-3 text-right font-semibold">Custo/result.</th><th className="pb-2 pr-3 text-right font-semibold">ROAS</th><th className="pb-2 pr-3 text-right font-semibold">CTR</th><th className="pb-2 text-right font-semibold">Orç./dia</th></tr></thead>
                    <tbody>
                      {linhas.map((l) => {
                        const sem = semResultado(l.t);
                        return (
                          <tr key={l.ref} className="border-t border-white/5">
                            <td className="max-w-[320px] py-2.5 pr-3"><span className="block truncate font-medium" title={l.info?.nome ?? l.ref}>{l.info?.nome ?? l.ref}</span>{l.info?.objetivo && <span className="text-[11px] text-white/40">{l.info.objetivo}</span>}</td>
                            <td className="py-2.5 pr-3"><span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", COR_STATUS[l.info?.status ?? ""] ?? "bg-white/10 text-white/60")}>{l.info?.status ?? "—"}</span></td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{dinheiro(l.t.gasto)}</td>
                            <td className={cn("py-2.5 pr-3 text-right tabular-nums", sem && "font-semibold text-rose-300")} title={sem ? "Gastou e não trouxe resultado neste período" : undefined}>{numero(l.t.resultados)}{sem && " ⚠"}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{dinheiro(custoPorResultado(l.t))}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{retorno(l.t) === null ? "—" : `${numero(retorno(l.t), 2)}x`}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{ctr(l.t) === null ? "—" : `${numero(ctr(l.t), 2)}%`}</td>
                            <td className="py-2.5 text-right tabular-nums text-white/70">{l.info?.orcamento_diario != null ? dinheiro(l.info.orcamento_diario) : "—"}</td>
                          </tr>);
                      })}
                    </tbody>
                  </table>
                </div>)}
            </section>
          </div>)}
      </DialogContent>
    </Dialog>
  );
}
