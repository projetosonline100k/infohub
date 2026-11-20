import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Loader2, Radio, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Estrutura, Funil, InsightDia, Nivel } from "@/lib/trafego/atribuicao";
import {
  CAMPOS_UTM, NOMES_SEMANA, calcularResumo, gastoPorDia, gastosPorNivel, periodoAnterior, preparar, quebrarPorDiaSemana, quebrarPorHora, quebrarPorMetodo, quebrarPorProduto, quebrarPorUtm,
  serieDiaria, somaGasto, variacao, vendasAoVivo, type Custos, type CampoUtm, type EventoVenda, type LinhaQuebra, type StatusAoVivo,
} from "@/lib/trafego/painel";
import { brl, campo, nf, painel, pct } from "./formato";

type Aba = "pagamento" | "plano" | "semana" | "hora" | "utm" | "dia";
const ABAS: { id: Aba; r: string }[] = [{ id: "pagamento", r: "Pagamento" }, { id: "plano", r: "Produto / plano" }, { id: "semana", r: "Dia da semana" }, { id: "hora", r: "Hora do dia" }, { id: "utm", r: "UTMs" }, { id: "dia", r: "Por dia" }];
const STATUS: Record<StatusAoVivo, { r: string; cor: string }> = {
  aprovada: { r: "Aprovada", cor: "bg-emerald-500/20 text-emerald-300" }, pendente: { r: "Aguardando", cor: "bg-amber-500/20 text-amber-300" }, vencida: { r: "Pendente vencida", cor: "bg-orange-500/20 text-orange-300" },
  cancelada: { r: "Cancelada", cor: "bg-rose-500/20 text-rose-300" }, reembolso: { r: "Reembolso", cor: "bg-fuchsia-500/20 text-fuchsia-300" }, abandono: { r: "Abandono", cor: "bg-white/10 text-white/60" },
};

interface Props {
  vendas: EventoVenda[]; est: Estrutura; insights: Record<Nivel, InsightDia[]>; temMeta: boolean;
  funil: Funil; funilAnterior: Funil; de: string; ate: string; moeda: string;
  custos: Custos; custosDisponivel: boolean; salvarCustos: (c: Custos) => Promise<void>; atualizadoEm: number;
}

function Variacao({ v, menorMelhor }: { v: number | null; menorMelhor?: boolean }) {
  if (v === null) return <span className="text-[11px] text-white/30">sem comparação</span>;
  if (Math.abs(v) < 0.005) return <span className="text-[11px] text-white/50">= igual ao período anterior</span>;
  const bom = menorMelhor ? v < 0 : v > 0;
  return <span className={cn("text-[11px] font-semibold", bom ? "text-emerald-300" : "text-rose-300")}>{v > 0 ? "▲" : "▼"} {Math.abs(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. período anterior</span>;
}
function Cartao({ titulo, valor, sub, v, menorMelhor, destaque, negativo }: { titulo: string; valor: string; sub?: string; v?: number | null; menorMelhor?: boolean; destaque?: boolean; negativo?: boolean }) {
  return (
    <div className={cn(painel, "p-3.5", destaque && "border-emerald-400/40")}>
      <p className="text-xs font-medium text-white/60">{titulo}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", negativo ? "text-rose-300" : "text-white")}>{valor}</p>
      {sub && <p className="text-[11px] text-white/45">{sub}</p>}
      {v !== undefined && <div className="mt-0.5"><Variacao v={v} menorMelhor={menorMelhor} /></div>}
    </div>
  );
}

export function PainelResultados({ vendas, est, insights, temMeta, funil, funilAnterior, de, ate, moeda, custos, custosDisponivel, salvarCustos, atualizadoEm }: Props) {
  const [aba, setAba] = useState<Aba>("pagamento");
  const [campoUtm, setCampoUtm] = useState<CampoUtm>("utm_campaign");
  const [rascunho, setRascunho] = useState({ taxa: String(custos.taxaPct), imposto: String(custos.impostoPct), outros: String(custos.outrosDia) });
  const [salvando, setSalvando] = useState(false);
  const [editado, setEditado] = useState(false);

  const prep = useMemo(() => preparar(vendas), [vendas, atualizadoEm]);   // eslint-disable-line react-hooks/exhaustive-deps -- o relógio muda o "pendente vencida"
  const ant = useMemo(() => periodoAnterior(de, ate), [de, ate]);
  const gasto = somaGasto(insights.campanha, de, ate), gastoAnt = somaGasto(insights.campanha, ant.de, ant.ate);
  const r = useMemo(() => calcularResumo(prep, custos, gasto, de, ate), [prep, custos, gasto, de, ate]);
  const ra = useMemo(() => calcularResumo(prep, custos, gastoAnt, ant.de, ant.ate), [prep, custos, gastoAnt, ant.de, ant.ate]);
  const serie = useMemo(() => serieDiaria(prep, custos, gastoPorDia(insights.campanha, de, ate), de, ate), [prep, custos, insights, de, ate]);
  const ao_vivo = useMemo(() => vendasAoVivo(prep, est, 30), [prep, est]);
  const gastosNiv = useMemo(() => gastosPorNivel(insights, de, ate), [insights, de, ate]);
  const dividir = (a: number | null, b: number) => (a !== null && b > 0 ? a / b : null);
  const convVisita = (x: Funil, aprov: number) => (x.visitas > 0 ? aprov / x.visitas : null);

  const linhas: LinhaQuebra[] = useMemo(() => {
    if (aba === "pagamento") return quebrarPorMetodo(prep, de, ate);
    if (aba === "plano") return quebrarPorProduto(prep, de, ate);
    if (aba === "semana") return quebrarPorDiaSemana(prep, de, ate);
    if (aba === "hora") return quebrarPorHora(prep, de, ate);
    if (aba === "utm") return quebrarPorUtm(prep, de, ate, campoUtm, est, gastosNiv);
    return [];
  }, [aba, campoUtm, prep, de, ate, est, gastosNiv]);
  const maxFat = Math.max(1, ...linhas.map((l) => l.faturamento));

  const mudou = (k: "taxa" | "imposto" | "outros", v: string) => { setRascunho((x) => ({ ...x, [k]: v })); setEditado(true); };
  const salvar = async () => {
    const n = (v: string) => Number(String(v).replace(",", ".")) || 0;
    setSalvando(true);
    try { await salvarCustos({ taxaPct: n(rascunho.taxa), impostoPct: n(rascunho.imposto), outrosDia: n(rascunho.outros) }); setEditado(false); } finally { setSalvando(false); }
  };

  const m = (x: number | null) => brl(x, moeda);
  const tooltip = { contentStyle: { background: "#0c1320", border: "1px solid rgba(255,255,255,.15)", borderRadius: 12, fontSize: 12 }, labelStyle: { color: "#fff" } };
  const semVendas = r.aprovadas + r.canceladas + r.pendentes + r.pendentesVencidas + r.abandonos + r.reembolsosN === 0;

  return (
    <div className="space-y-4">
      {!temMeta && <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertTriangle className="mr-1.5 inline h-4 w-4" />A Meta ainda não trouxe o gasto de anúncios. Faturamento, vendas, aprovação, reembolso e quebras já usam as vendas reais; lucro, margem, ROI, ROAS e custo por venda aparecem como “—” até conectar a conta de anúncios.</p>}
      {semVendas && <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/60">Nenhuma venda, pendência ou abandono neste período. Escolha outro período acima.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Cartao titulo="Faturamento bruto" valor={m(r.bruto)} v={variacao(r.bruto, ra.bruto)} />
        <Cartao titulo="Faturamento líquido" valor={m(r.receitaLiquida)} sub="sem reembolso, taxa e imposto" v={variacao(r.receitaLiquida, ra.receitaLiquida)} />
        <Cartao titulo="Lucro líquido" valor={m(r.lucro)} sub={r.lucro === null ? "precisa do gasto da Meta" : "depois do gasto e dos custos"} v={variacao(r.lucro, ra.lucro)} destaque negativo={r.lucro !== null && r.lucro < 0} />
        <Cartao titulo="Margem" valor={pct(r.margem)} v={variacao(r.margem, ra.margem)} negativo={r.margem !== null && r.margem < 0} />
        <Cartao titulo="ROI" valor={r.roi === null ? "—" : `${nf(r.roi * 100, 1)}%`} sub="lucro ÷ custo total" v={variacao(r.roi, ra.roi)} negativo={r.roi !== null && r.roi < 0} />
        <Cartao titulo="ROAS" valor={r.roas === null ? "—" : `${nf(r.roas, 2)}x`} sub="faturamento ÷ gasto" v={variacao(r.roas, ra.roas)} />
        <Cartao titulo="Gasto com anúncios" valor={m(r.gasto)} v={variacao(r.gasto, ra.gasto)} menorMelhor />
        <Cartao titulo="Vendas aprovadas" valor={nf(r.aprovadas)} v={variacao(r.aprovadas, ra.aprovadas)} />
        <Cartao titulo="Ticket médio" valor={m(r.ticketMedio)} v={variacao(r.ticketMedio, ra.ticketMedio)} />
        <Cartao titulo="Custo por venda (CPA)" valor={m(r.cpa)} v={variacao(r.cpa, ra.cpa)} menorMelhor />
        <Cartao titulo="Taxa de aprovação" valor={pct(r.taxaAprovacao)} sub={`${r.aprovadas} de ${r.aprovadas + r.canceladas + r.pendentesVencidas} (por método: aba Pagamento)`} v={variacao(r.taxaAprovacao, ra.taxaAprovacao)} />
        <Cartao titulo="Reembolsos" valor={`${nf(r.reembolsosN)} · ${m(r.reembolsosValor)}`} sub={`${pct(r.pctReembolso)} do faturado`} v={variacao(r.reembolsosValor, ra.reembolsosValor)} menorMelhor />
        <Cartao titulo="Pendentes aguardando" valor={nf(r.pendentes)} sub={`Pix/boleto/cartão há menos de 24 h${r.pendentesVencidas ? ` · ${r.pendentesVencidas} vencidas` : ""}`} v={variacao(r.pendentes, ra.pendentes)} />
        <Cartao titulo="Abandonos de checkout" valor={nf(r.abandonos)} v={variacao(r.abandonos, ra.abandonos)} menorMelhor />
        <Cartao titulo="Conversão visita → venda" valor={pct(convVisita(funil, r.aprovadas))} sub={`${nf(funil.visitas)} visitas no quiz`} v={variacao(convVisita(funil, r.aprovadas), convVisita(funilAnterior, ra.aprovadas))} />
        <Cartao titulo="Custo por visita" valor={m(dividir(r.gasto, funil.visitas))} v={variacao(dividir(r.gasto, funil.visitas), dividir(ra.gasto, funilAnterior.visitas))} menorMelhor />
        <Cartao titulo="Custo por lead" valor={m(dividir(r.gasto, funil.leads))} sub={`${nf(funil.leads)} leads`} v={variacao(dividir(r.gasto, funil.leads), dividir(ra.gasto, funilAnterior.leads))} menorMelhor />
        <Cartao titulo="Custo por checkout" valor={m(dividir(r.gasto, funil.cliquesOferta))} sub={`${nf(funil.cliquesOferta)} cliques na oferta`} v={variacao(dividir(r.gasto, funil.cliquesOferta), dividir(ra.gasto, funilAnterior.cliquesOferta))} menorMelhor />
      </div>

      <section className={`${painel} space-y-3 p-4`}>
        <div className="flex flex-wrap items-baseline gap-x-3"><h3 className="text-sm font-bold">Custos do projeto</h3><p className="text-xs text-white/45">Entram no lucro líquido. Taxa sobre as vendas aprovadas; imposto sobre o faturamento depois do reembolso; outros custos × dias do período.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          {([["taxa", "Taxa da plataforma (%)"], ["imposto", "Imposto (%)"], ["outros", "Outros custos por dia (R$)"]] as const).map(([k, r2]) => (
            <label key={k} className="space-y-1 text-xs text-white/60">{r2}<input inputMode="decimal" value={rascunho[k]} onChange={(e) => mudou(k, e.target.value)} className={cn(campo, "w-44")} /></label>))}
          <button type="button" onClick={() => void salvar()} disabled={!editado || salvando} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold hover:bg-sky-400 disabled:opacity-50">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar custos</button>
        </div>
        {!custosDisponivel && <p className="text-xs text-amber-200">A tabela de custos ainda não existe no banco (migração pendente): o que você digitar vale só nesta tela e some ao recarregar.</p>}
        {custos.taxaPct + custos.impostoPct + custos.outrosDia === 0 && <p className="text-xs text-white/45">Custos zerados: o lucro líquido por enquanto é só faturamento − gasto de anúncios.</p>}
      </section>

      <section className={`${painel} space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {ABAS.map((a) => <button key={a.id} type="button" onClick={() => setAba(a.id)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", aba === a.id ? "bg-sky-500 text-white" : "border border-white/15 text-white/70 hover:bg-white/10")}>{a.r}</button>)}
          {aba === "utm" && <span className="mx-1 h-5 w-px bg-white/15" />}
          {aba === "utm" && CAMPOS_UTM.map((c) => <button key={c.campo} type="button" onClick={() => setCampoUtm(c.campo)} className={cn("rounded-lg px-2.5 py-1 text-xs", campoUtm === c.campo ? "bg-white text-black" : "border border-white/15 text-white/60 hover:bg-white/10")}>{c.rotulo}</button>)}
        </div>

        {aba === "dia" ? (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie.map((s) => ({ ...s, dia: s.dia.slice(8) + "/" + s.dia.slice(5, 7) }))}>
                  <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: "rgba(255,255,255,.5)", fontSize: 11 }} /><YAxis tick={{ fill: "rgba(255,255,255,.5)", fontSize: 11 }} width={60} />
                  <Tooltip {...tooltip} formatter={(v: number | null) => (v === null || v === undefined ? "—" : brl(v, moeda))} /><Legend />
                  <Bar dataKey="faturamento" name="Faturamento" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="gasto" name="Gasto" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                  <Line dataKey="lucro" name="Lucro líquido" stroke="#34d399" strokeWidth={2} dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wide text-white/40"><th className="pb-2 text-left">Dia</th><th className="pb-2 pr-3 text-right">Faturamento</th><th className="pb-2 pr-3 text-right">Gasto</th><th className="pb-2 pr-3 text-right">Lucro líquido</th></tr></thead>
              <tbody>{[...serie].reverse().map((s) => <tr key={s.dia} className="border-t border-white/5"><td className="py-1.5">{s.dia.split("-").reverse().join("/")}</td><td className="py-1.5 pr-3 text-right tabular-nums">{m(s.faturamento)}</td><td className="py-1.5 pr-3 text-right tabular-nums">{m(s.gasto)}</td><td className={cn("py-1.5 pr-3 text-right tabular-nums", s.lucro !== null && s.lucro < 0 && "text-rose-300")}>{m(s.lucro)}</td></tr>)}</tbody>
            </table></div>
          </>
        ) : linhas.length === 0 ? <p className="py-6 text-center text-sm text-white/50">Sem vendas neste período para esta quebra.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-white/40">
              <th className="pb-2 text-left">{aba === "utm" ? CAMPOS_UTM.find((c) => c.campo === campoUtm)?.rotulo : ABAS.find((a) => a.id === aba)?.r}</th>
              <th className="pb-2 pr-3 text-right">Vendas</th><th className="w-40 pb-2 pr-3 text-right">Faturamento</th><th className="pb-2 pr-3 text-right">Aprovação</th><th className="pb-2 pr-3 text-right">Cancel./pend.</th><th className="pb-2 pr-3 text-right">Reembolsos</th>
              {aba === "utm" && <><th className="pb-2 pr-3 text-right">Gasto</th><th className="pb-2 pr-3 text-right">ROAS</th></>}
            </tr></thead>
            <tbody>{linhas.map((l) => (
              <tr key={l.chave} className="border-t border-white/5">
                <td className="max-w-[320px] truncate py-1.5 pr-3 font-medium" title={l.rotulo}>{aba === "semana" ? NOMES_SEMANA[Number(l.chave)] : l.rotulo}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{nf(l.aprovadas)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums"><div className="relative"><div className="absolute inset-y-0 right-0 rounded bg-sky-500/15" style={{ width: `${Math.max(0, (l.faturamento / maxFat) * 100)}%` }} /><span className="relative">{m(l.faturamento)}</span></div></td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{pct(l.taxaAprovacao)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-white/60">{nf(l.canceladas)} / {nf(l.pendentes)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-white/60">{nf(l.reembolsosN)}</td>
                {aba === "utm" && <><td className="py-1.5 pr-3 text-right tabular-nums">{m(l.gasto)}</td><td className="py-1.5 pr-3 text-right tabular-nums">{l.roas === null ? "—" : `${nf(l.roas, 2)}x`}</td></>}
              </tr>))}</tbody>
          </table>
          {aba === "hora" && <p className="mt-2 text-xs text-white/40">Horário de Brasília, pela hora em que a plataforma avisou. A taxa de aprovação desconta pendentes com menos de 24 h.</p>}
          {aba === "utm" && <p className="mt-2 text-xs text-white/40">Gasto só aparece para campanha, conjunto (medium) e anúncio (content) que batem com a Meta. “nome|id” é mostrado só pelo nome.</p>}
          </div>)}
      </section>

      <section className={`${painel} space-y-3 p-4`}>
        <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-emerald-300" /><h3 className="text-sm font-bold">Vendas ao vivo</h3><span className="text-xs text-white/40">atualiza sozinha · última leitura {new Date(atualizadoEm).toLocaleTimeString("pt-BR")}</span></div>
        {ao_vivo.length === 0 ? <p className="py-4 text-center text-sm text-white/50">Ainda não chegou nenhuma venda.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-white/40"><th className="pb-2 text-left">Quando</th><th className="pb-2 text-left">Comprador</th><th className="pb-2 text-left">Produto</th><th className="pb-2 pr-3 text-right">Valor</th><th className="pb-2 text-left">Método</th><th className="pb-2 text-left">Status</th><th className="pb-2 text-left">Origem (anúncio)</th></tr></thead>
            <tbody>{ao_vivo.map((v) => (
              <tr key={v.id + v.status} className="border-t border-white/5">
                <td className="whitespace-nowrap py-1.5 pr-3 text-white/70">{new Date(v.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="py-1.5 pr-3">{v.comprador}</td><td className="max-w-[200px] truncate py-1.5 pr-3" title={v.produto}>{v.produto}</td>
                <td className={cn("py-1.5 pr-3 text-right tabular-nums", v.valor !== null && v.valor < 0 && "text-fuchsia-300")}>{m(v.valor)}</td>
                <td className="py-1.5 pr-3">{v.metodo}</td>
                <td className="py-1.5 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS[v.status].cor)}>{STATUS[v.status].r}</span></td>
                <td className="max-w-[260px] truncate py-1.5" title={v.origem}>{v.origem}</td>
              </tr>))}</tbody>
          </table></div>)}
      </section>
    </div>
  );
}
