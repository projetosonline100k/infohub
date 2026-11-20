import { useMemo, useState } from "react";
import { AlertTriangle, Flame, ImageOff, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LinhaTrafego } from "@/lib/trafego/atribuicao";
import { MULTIPLO_SEM_VENDA, QTD_MELHORES, rankingCriativos, type Custos, type CriterioRanking } from "@/lib/trafego/painel";
import { brl, nf, painel } from "./formato";

const CRITERIOS: { id: CriterioRanking; r: string }[] = [{ id: "roas", r: "ROAS" }, { id: "lucro", r: "Lucro" }, { id: "custoPorVenda", r: "Custo por venda" }];

/** Ranking de criativos (anúncios): ordena pelo critério, destaca os melhores e os que gastam sem vender. */
export function RankingCriativos({ linhas, custos, ticketMedio, miniaturas, moeda }: { linhas: LinhaTrafego[]; custos: Custos; ticketMedio: number | null; miniaturas: Record<string, string | null>; moeda: string }) {
  const [criterio, setCriterio] = useState<CriterioRanking>("roas");
  const rank = useMemo(() => rankingCriativos(linhas, custos, ticketMedio, criterio), [linhas, custos, ticketMedio, criterio]);
  const m = (x: number | null) => brl(x, moeda);
  return (
    <section className={`${painel} space-y-3 p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-2 text-sm font-bold">Ranking de criativos</h3>
        <span className="text-xs text-white/45">ordenar por</span>
        {CRITERIOS.map((c) => <button key={c.id} type="button" onClick={() => setCriterio(c.id)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", criterio === c.id ? "bg-sky-500 text-white" : "border border-white/15 text-white/70 hover:bg-white/10")}>{c.r}</button>)}
      </div>
      <p className="text-xs text-white/50">
        <Trophy className="mr-1 inline h-3.5 w-3.5 text-emerald-300" />Melhores: os {QTD_MELHORES} primeiros do ranking que deram lucro (venda e lucro líquido positivo, já descontando taxa e imposto).{" "}
        <Flame className="mx-1 inline h-3.5 w-3.5 text-rose-300" />Gastando sem vender: nenhuma venda e gasto maior que {MULTIPLO_SEM_VENDA}× o ticket médio ({ticketMedio === null ? "sem vendas no período: regra desligada" : m(ticketMedio)}).
      </p>
      {rank.length === 0 ? <p className="py-6 text-center text-sm text-white/50">Nenhum anúncio com gasto ou venda neste período.</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wide text-white/40">
            <th className="pb-2 text-left">#</th><th className="pb-2 text-left">Criativo</th><th className="pb-2 pr-3 text-right">Gasto</th><th className="pb-2 pr-3 text-right">Vendas</th><th className="pb-2 pr-3 text-right">Faturamento</th>
            <th className="pb-2 pr-3 text-right">Lucro líq.</th><th className="pb-2 pr-3 text-right">ROAS</th><th className="pb-2 pr-3 text-right">Custo/venda</th><th className="pb-2 pr-3 text-right">Visitas</th><th className="pb-2 pr-3 text-right">Leads</th><th className="pb-2 pr-3 text-right">Cliques oferta</th>
          </tr></thead>
          <tbody>{rank.map((x, i) => {
            const l = x.linha; const mini = miniaturas[l.ref];
            return (
              <tr key={l.chave} className={cn("border-t border-white/5", x.selo === "melhor" && "bg-emerald-500/[0.07]", x.selo === "queimando" && "bg-rose-500/[0.08]")}>
                <td className="py-2 pr-2 text-white/50">{i + 1}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-3">
                    {mini ? <img src={mini} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/30"><ImageOff className="h-4 w-4" /></span>}
                    <div className="min-w-0">
                      <p className="max-w-[300px] truncate font-medium" title={l.nome}>{l.nome}</p>
                      {x.selo === "melhor" && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300"><Trophy className="h-3 w-3" />Melhor · {x.motivo}</span>}
                      {x.selo === "lucrando" && <span className="text-[11px] text-emerald-300/80">Com lucro</span>}
                      {x.selo === "queimando" && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300"><AlertTriangle className="h-3 w-3" />{x.motivo}</span>}
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{m(l.gasto)}</td><td className="py-2 pr-3 text-right tabular-nums">{nf(l.vendas)}</td><td className="py-2 pr-3 text-right tabular-nums">{m(l.faturamento)}</td>
                <td className={cn("py-2 pr-3 text-right tabular-nums", x.lucroLiquido < 0 && "text-rose-300")}>{m(x.lucroLiquido)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{l.roas === null ? "—" : `${nf(l.roas, 2)}x`}</td><td className="py-2 pr-3 text-right tabular-nums">{m(l.custoPorVenda)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{nf(l.funil.visitas)}</td><td className="py-2 pr-3 text-right tabular-nums">{nf(l.leads)}</td><td className="py-2 pr-3 text-right tabular-nums">{nf(l.cliquesOferta)}</td>
              </tr>);
          })}</tbody>
        </table></div>)}
    </section>
  );
}
