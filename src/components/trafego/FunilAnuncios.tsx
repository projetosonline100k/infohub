import { AlertTriangle } from "lucide-react";
import { anuncioComPiorQueda, etapasDoFunil, piorQueda, type LinhaTrafego } from "@/lib/trafego/atribuicao";
import { brl, nf, painel, pct } from "./formato";

/** Funil por anúncio: visitas → começaram → terminaram → leads → clicaram na oferta → compraram, com taxa entre etapas e custo por etapa. */
export function FunilAnuncios({ linhas, extras, moeda }: { linhas: LinhaTrafego[]; extras: LinhaTrafego[]; moeda: string }) {
  const anuncios = linhas.filter((l) => l.nivel === "anuncio" && (l.gasto > 0 || l.funil.visitas > 0 || l.vendas !== 0)).sort((a, b) => b.gasto - a.gasto || b.funil.visitas - a.funil.visitas);
  const pior = anuncioComPiorQueda(anuncios);
  if (!anuncios.length && !extras.length) return <p className={`${painel} p-6 text-center text-sm text-white/55`}>Nenhum anúncio com visita, gasto ou venda neste período.</p>;
  const cartao = (l: LinhaTrafego, destaque: boolean) => {
    const et = etapasDoFunil(l.funil, l.gasto), q = piorQueda(l.funil);
    const max = Math.max(1, ...et.map((e) => e.n));
    return (
      <section key={l.chave} className={`${painel} space-y-3 p-4 ${destaque ? "border-rose-400/50" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold">{l.nome}</h4>
          {l.gasto > 0 && <span className="text-xs text-white/50">gasto {brl(l.gasto, moeda)}</span>}
          {destaque && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200"><AlertTriangle className="h-3 w-3" />pior queda</span>}
        </div>
        <div className="space-y-1.5">
          {et.map((e) => (
            <div key={e.campo} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm">
              <span className="text-white/70">{e.rotulo}</span>
              <div className="h-5 rounded bg-white/5"><div className="h-5 rounded bg-sky-500/60" style={{ width: `${Math.max(e.n > 0 ? 2 : 0, (Math.max(e.n, 0) / max) * 100)}%` }} /></div>
              <span className="w-64 text-right tabular-nums text-white/80">
                <b>{nf(e.n)}</b>
                <span className="ml-2 text-xs text-white/45">{e.taxa !== null ? `${pct(e.taxa)} da etapa anterior` : ""}{l.gasto > 0 && e.custo !== null ? ` · ${brl(e.custo, moeda)} cada` : ""}</span>
              </span>
            </div>
          ))}
        </div>
        {q && q.perda > 0 && <p className="text-xs text-white/55">Maior queda: de <b>{q.de}</b> para <b>{q.para}</b> ({pct(q.perda)} se perdem).</p>}
      </section>
    );
  };
  return (
    <div className="space-y-3">
      {pior && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100"><AlertTriangle className="mr-1.5 inline h-4 w-4" />O anúncio <b>{pior.linha.nome}</b> tem a pior queda: {pct(pior.queda.perda)} se perdem de “{pior.queda.de}” para “{pior.queda.para}”. (Só conta etapa com pelo menos 10 pessoas.)</p>}
      {anuncios.map((l) => cartao(l, pior?.linha.chave === l.chave))}
      {extras.map((l) => cartao(l, false))}
    </div>
  );
}
