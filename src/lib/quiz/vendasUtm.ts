// Vendas por UTM (12/11/2026, Davi: "uma visualização estilo UTMify"): faturamento, pagamento, dia da semana e origem de cada venda, com o
// investimento digitado por origem (lucro e ROAS). Sem React nem importações: testável.

export interface VendaUtm {
  transacao_id?: string | null; tipo: string; comprador_email?: string | null; valor: number | null; data: string; metodo_pagamento?: string | null;
  utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null;
}

export type Pagamento = "Pix" | "Cartão" | "Boleto" | "Outros" | "Não informado";
export function rotuloPagamento(m: string | null | undefined): Pagamento {
  const v = (m ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!v) return "Não informado";
  if (v.includes("pix")) return "Pix";
  if (v.includes("card") || v.includes("cartao") || v.includes("credit") || v.includes("debit")) return "Cartão";
  if (v.includes("boleto") || v.includes("billet") || v.includes("bank")) return "Boleto";
  return "Outros";
}

export const chaveOrigem = (source?: string | null, medium?: string | null, campaign?: string | null) => `${source ?? ""}|${medium ?? ""}|${campaign ?? ""}`;
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export interface ResumoVendas {
  liquidas: VendaUtm[]; faturamento: number; nVendas: number; ticket: number; reembolsos: { n: number; valor: number };
  porPagamento: { rotulo: Pagamento; n: number; valor: number; pct: number }[];
  porDiaSemana: { dia: string; n: number; pct: number }[];
}

/** Vendas do período (por `data`), sem as reembolsadas; `dias` = 0 → tudo. */
export function resumoVendas(vendas: VendaUtm[], dias: number, agora = Date.now()): ResumoVendas {
  const desde = dias ? new Date(agora - dias * 86_400_000).toISOString().slice(0, 10) : "";
  const doPeriodo = vendas.filter((v) => !desde || v.data.slice(0, 10) >= desde);
  const reemb = new Set(vendas.filter((v) => v.tipo === "reembolso" && v.transacao_id).map((v) => v.transacao_id as string));
  const liquidas = doPeriodo.filter((v) => v.tipo === "venda" && !(v.transacao_id && reemb.has(v.transacao_id)));
  const reembolsados = doPeriodo.filter((v) => v.tipo === "venda" && v.transacao_id && reemb.has(v.transacao_id));
  const faturamento = liquidas.reduce((s, v) => s + Number(v.valor ?? 0), 0);
  const pg = new Map<Pagamento, { n: number; valor: number }>();
  for (const v of liquidas) { const k = rotuloPagamento(v.metodo_pagamento); const a = pg.get(k) ?? { n: 0, valor: 0 }; pg.set(k, { n: a.n + 1, valor: a.valor + Number(v.valor ?? 0) }); }
  const dia = DIAS.map((d) => ({ dia: d, n: 0, pct: 0 }));
  for (const v of liquidas) dia[new Date(`${v.data.slice(0, 10)}T12:00:00`).getDay()].n++;
  for (const d of dia) d.pct = pct(d.n, liquidas.length);
  return {
    liquidas, faturamento, nVendas: liquidas.length, ticket: liquidas.length ? faturamento / liquidas.length : 0,
    reembolsos: { n: reembolsados.length, valor: reembolsados.reduce((s, v) => s + Number(v.valor ?? 0), 0) },
    porPagamento: [...pg.entries()].map(([rotulo, a]) => ({ rotulo, ...a, pct: pct(a.n, liquidas.length) })).sort((a, b) => b.n - a.n),
    porDiaSemana: dia,
  };
}

export interface LinhaTabela {
  chave: string; source: string; medium: string; campaign: string;
  visitas: number; leads: number; checkout: number; vendas: number; faturamento: number; ticket: number;
  investimento: number; lucro: number; roas: number | null; conversao: number;
}
/** Uma linha por origem (UTM): o que veio do quiz (visitas, leads, checkout) junto com as vendas e o investimento digitado. */
export function tabelaPorOrigem(
  origens: { source: string; medium: string; campaign: string; visitas: number; leads: number; checkout: number }[],
  liquidas: VendaUtm[], investimentos: Map<string, number>,
): LinhaTabela[] {
  const mapa = new Map<string, LinhaTabela>();
  const linha = (source: string, medium: string, campaign: string) => {
    const chave = chaveOrigem(source, medium, campaign);
    let l = mapa.get(chave);
    if (!l) { l = { chave, source, medium, campaign, visitas: 0, leads: 0, checkout: 0, vendas: 0, faturamento: 0, ticket: 0, investimento: 0, lucro: 0, roas: null, conversao: 0 }; mapa.set(chave, l); }
    return l;
  };
  for (const o of origens) {
    // o conteúdo (utm_content) não separa linhas: soma na origem/meio/campanha
    const l = linha(o.source, o.medium, o.campaign);
    l.visitas += o.visitas; l.leads += o.leads; l.checkout += o.checkout;
  }
  for (const v of liquidas) { const l = linha(v.utm_source ?? "", v.utm_medium ?? "", v.utm_campaign ?? ""); l.vendas++; l.faturamento += Number(v.valor ?? 0); }
  for (const [chave, valor] of investimentos) { const [a, b, c] = chave.split("|"); const l = mapa.get(chave) ?? linha(a ?? "", b ?? "", c ?? ""); l.investimento = valor; }
  for (const l of mapa.values()) {
    l.ticket = l.vendas ? l.faturamento / l.vendas : 0;
    l.lucro = l.faturamento - l.investimento;
    l.roas = l.investimento > 0 ? l.faturamento / l.investimento : null;
    l.conversao = pct(l.vendas, l.visitas);
  }
  return [...mapa.values()].sort((a, b) => b.faturamento - a.faturamento || b.visitas - a.visitas);
}
