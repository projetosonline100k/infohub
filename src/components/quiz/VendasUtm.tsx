import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DollarSign, Percent, Receipt, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { origens, type EventoQuiz, type LeadQuiz } from "@/lib/quiz/painel";
import { resumoVendas, tabelaPorOrigem, type Pagamento, type VendaUtm } from "@/lib/quiz/vendasUtm";

// Vendas por UTM (12/11/2026, Davi: "uma visualização estilo UTMify"): faturamento, lucro e ROAS por origem, vendas por forma de pagamento e
// por dia da semana, funil e a tabela de resultado por campanha. As vendas vêm da Eduzz/Kiwify/Hotmart (com a UTM do link); o investimento em
// anúncios é digitado na tabela (ainda não lemos o gasto do Meta Ads).
const db = supabase as unknown as SupabaseClient;
const cartao = "rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-[#0c1b27] to-[#08121c] p-4";
const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const COR_PAGAMENTO: Record<Pagamento, string> = { Pix: "#22d3ee", Cartão: "#3b82f6", Boleto: "#facc15", Outros: "#f87171", "Não informado": "#64748b" };

export function VendasUtm({ quizId, eventos, leads, vendas, dias }: { quizId: string; eventos: EventoQuiz[]; leads: LeadQuiz[]; vendas: VendaUtm[]; dias: number }) {
  const [origem, setOrigem] = useState("");
  const [soComOrigem, setSoComOrigem] = useState(false);
  const [invest, setInvest] = useState<Map<string, number>>(new Map());
  const [clienteId, setClienteId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data: q } = await db.from("quizzes").select("cliente_id").eq("id", quizId).maybeSingle();
    setClienteId((q as { cliente_id: string } | null)?.cliente_id ?? null);
    const { data } = await db.from("quiz_investimentos").select("chave, valor").eq("quiz_id", quizId);
    setInvest(new Map(((data ?? []) as { chave: string; valor: number }[]).map((x) => [x.chave, Number(x.valor)])));
  }, [quizId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const desde = dias ? Date.now() - dias * 86_400_000 : 0;
  const resumo = useMemo(() => resumoVendas(vendas, dias), [vendas, dias]);
  const liquidas = useMemo(() => resumo.liquidas.filter((v) => (!origem || (v.utm_source ?? "") === origem) && (!soComOrigem || !!v.utm_source)), [resumo, origem, soComOrigem]);
  const linhasOrigem = useMemo(() => origens(eventos.filter((e) => Date.parse(e.criado_em) >= desde), leads.filter((l) => Date.parse(l.criada_em) >= desde)), [eventos, leads, desde]);
  const tabela = useMemo(() => tabelaPorOrigem(linhasOrigem, liquidas, invest).filter((l) => (!origem || l.source === origem) && (!soComOrigem || !!l.source)), [linhasOrigem, liquidas, invest, origem, soComOrigem]);
  const fontes = useMemo(() => [...new Set([...resumo.liquidas.map((v) => v.utm_source ?? ""), ...linhasOrigem.map((o) => o.source)].filter(Boolean))].sort(), [resumo, linhasOrigem]);

  // Os números do topo seguem os filtros (origem e "só com origem").
  const faturamento = liquidas.reduce((s, v) => s + Number(v.valor ?? 0), 0);
  const nVendas = liquidas.length;
  const investimento = tabela.reduce((s, l) => s + l.investimento, 0);
  const lucro = faturamento - investimento;
  const roas = investimento > 0 ? faturamento / investimento : null;
  const tot = tabela.reduce((a, l) => ({ visitas: a.visitas + l.visitas, leads: a.leads + l.leads, checkout: a.checkout + l.checkout }), { visitas: 0, leads: 0, checkout: 0 });
  const pag = useMemo(() => resumoVendas(liquidas.map((v) => ({ ...v })), 0).porPagamento, [liquidas]);
  const semana = useMemo(() => resumoVendas(liquidas.map((v) => ({ ...v })), 0).porDiaSemana, [liquidas]);

  const salvarInvestimento = async (chave: string, valor: number) => {
    if (!clienteId) return;
    const { error } = await db.from("quiz_investimentos").upsert({ quiz_id: quizId, cliente_id: clienteId, chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "quiz_id,chave" });
    if (error) { toast.error("Não consegui salvar o investimento"); return; }
    setInvest((m) => new Map(m).set(chave, valor));
  };

  const kpi = (titulo: string, valor: string, sub: string | null, Icone: typeof Wallet, cor: string, destaque?: boolean) => (
    <div className={cn(cartao, destaque && "border-emerald-400/40 shadow-[0_0_24px_rgba(52,211,153,0.15)]")}>
      <p className="flex items-center gap-2 text-sm font-medium text-white/75"><Icone className="h-4 w-4 text-cyan-300" />{titulo}</p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums", cor)}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-white/45">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold text-white">Resumo de vendas</h3>
        <span className="text-xs text-white/45">{dias > 0 && dias < 1 ? "hoje" : dias ? `últimos ${dias} dias` : "desde o início"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="rounded-lg border border-white/10 bg-[#0a1520] px-3 py-1.5 text-white outline-none">
            <option value="">Todas as origens</option>{fontes.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/70"><input type="checkbox" checked={soComOrigem} onChange={(e) => setSoComOrigem(e.target.checked)} />só vendas com origem (UTM)</label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpi("Faturamento líquido", moeda(faturamento), resumo.reembolsos.n ? `${resumo.reembolsos.n} reembolso${resumo.reembolsos.n > 1 ? "s" : ""} (${moeda(resumo.reembolsos.valor)}) fora` : null, DollarSign, "text-emerald-300", true)}
        {kpi("Investimento", moeda(investimento), investimento ? "digitado na tabela" : "preencha na tabela abaixo", Wallet, "text-white")}
        {kpi("Lucro", moeda(lucro), investimento ? null : "sem investimento informado", TrendingUp, lucro < 0 ? "text-rose-300" : "text-emerald-300")}
        {kpi("ROAS", roas == null ? "—" : `${roas.toFixed(2).replace(".", ",")}x`, roas == null ? "faturamento ÷ investimento" : null, Percent, roas != null && roas < 1 ? "text-rose-300" : "text-emerald-300")}
        {kpi("Vendas", String(nVendas), "do projeto, todas as origens", ShoppingCart, "text-white")}
        {kpi("Ticket médio", moeda(nVendas ? faturamento / nVendas : 0), null, Receipt, "text-white")}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={cartao}>
          <h4 className="font-bold text-white">Vendas por pagamento</h4>
          {pag.length === 0 ? <p className="py-10 text-center text-sm text-white/40">Sem vendas no período.</p> : (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
              <Donut fatias={pag.map((p) => ({ rotulo: p.rotulo, n: p.n, cor: COR_PAGAMENTO[p.rotulo] }))} total={nVendas} />
              <ul className="space-y-1 text-sm">{pag.map((p) => <li key={p.rotulo} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_PAGAMENTO[p.rotulo] }} /><span className="text-white/80">{p.rotulo}</span><span className="ml-2 tabular-nums text-white/50">{p.n} · {p.pct}%</span></li>)}</ul>
            </div>
          )}
        </section>

        <section className={cartao}>
          <h4 className="font-bold text-white">Vendas por dia da semana</h4>
          {nVendas === 0 ? <p className="py-10 text-center text-sm text-white/40">Sem vendas no período.</p> : (
            <div className="mt-3 flex h-40 items-end gap-2">
              {(() => {
                const m = Math.max(1, ...semana.map((d) => d.pct));
                return semana.map((d) => (
                  <div key={d.dia} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.dia}: ${d.n} ${d.n === 1 ? "venda" : "vendas"}`}>
                    <span className="text-[10px] tabular-nums text-white/70">{d.pct}%</span>
                    <span className="block w-full rounded-t bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.5)]" style={{ height: `${(d.pct / m) * 100}%`, minHeight: d.n ? 4 : 1, opacity: d.n ? 1 : 0.25 }} />
                    <span className="text-[10px] text-white/45">{d.dia}</span>
                  </div>
                ));
              })()}
            </div>
          )}
        </section>

      </div>

      <section className={cartao}>
        <h4 className="font-bold text-white">Resultado por origem e campanha</h4>
        <p className="text-xs text-white/50">Digite quanto você investiu em cada origem para ver lucro e ROAS. As vendas entram pela UTM do link (o quiz leva a UTM até o checkout).</p>
        {tabela.length === 0 ? <p className="py-8 text-center text-sm text-white/40">Ainda sem dados neste período.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-left text-xs text-white/50"><tr>
                {["Origem", "Meio", "Campanha"].map((h) => <th key={h} className="py-1.5 font-medium">{h}</th>)}
                {["Visitas", "Leads", "Checkout", "Vendas", "Faturamento", "Ticket", "Investimento", "Lucro", "ROAS", "Conv."].map((h) => <th key={h} className="text-right font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {tabela.map((l) => (
                  <tr key={l.chave} className="border-t border-white/5">
                    <td className="py-1.5 font-medium text-white">{l.source || <span className="text-white/45">Sem origem</span>}</td>
                    <td className="text-white/70">{l.medium || "—"}</td><td className="text-white/70">{l.campaign || "—"}</td>
                    <td className="text-right tabular-nums text-white/80">{l.visitas}</td><td className="text-right tabular-nums text-white/80">{l.leads}</td><td className="text-right tabular-nums text-white/80">{l.checkout}</td>
                    <td className="text-right tabular-nums text-white">{l.vendas}</td>
                    <td className="text-right tabular-nums text-emerald-300">{moeda(l.faturamento)}</td>
                    <td className="text-right tabular-nums text-white/70">{l.vendas ? moeda(l.ticket) : "—"}</td>
                    <td className="text-right"><CampoInvestimento valor={l.investimento} onSalvar={(v) => void salvarInvestimento(l.chave, v)} /></td>
                    <td className={cn("text-right tabular-nums", l.investimento ? (l.lucro < 0 ? "text-rose-300" : "text-emerald-300") : "text-white/35")}>{l.investimento ? moeda(l.lucro) : "—"}</td>
                    <td className={cn("text-right tabular-nums", l.roas != null && l.roas < 1 ? "text-rose-300" : "text-white/80")}>{l.roas == null ? "—" : `${l.roas.toFixed(2).replace(".", ",")}x`}</td>
                    <td className="text-right tabular-nums text-white/60">{l.conversao}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CampoInvestimento({ valor, onSalvar }: { valor: number; onSalvar: (v: number) => void }) {
  const [t, setT] = useState(valor ? String(valor).replace(".", ",") : "");
  useEffect(() => setT(valor ? String(valor).replace(".", ",") : ""), [valor]);
  const salvar = () => { const n = Number(t.replace(/\./g, "").replace(",", ".")); if (Number.isFinite(n) && n >= 0 && n !== valor) onSalvar(n); };
  return <input value={t} onChange={(e) => setT(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder="R$ 0" inputMode="decimal" className="w-24 rounded-md border border-white/10 bg-[#0a1520] px-2 py-1 text-right text-sm tabular-nums text-white outline-none focus:border-cyan-400/50" />;
}

function Donut({ fatias, total }: { fatias: { rotulo: string; n: number; cor: string }[]; total: number }) {
  const R = 54, C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36">
      <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
      {fatias.map((f) => {
        const len = total ? (f.n / total) * C : 0;
        const el = <circle key={f.rotulo} cx="70" cy="70" r={R} fill="none" stroke={f.cor} strokeWidth="18" strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-acumulado} transform="rotate(-90 70 70)" />;
        acumulado += len;
        return el;
      })}
      <text x="70" y="66" textAnchor="middle" className="fill-white/55" fontSize="10">Total</text>
      <text x="70" y="86" textAnchor="middle" className="fill-white" fontSize="22" fontWeight="700">{total}</text>
    </svg>
  );
}
