// Afiliados do quiz (12/11/2026, Davi: "a venda que sair dele puxa que foi dele, nada de perder dados nem cruzar").
// Sem React nem importações: testável. Regras (cada venda é creditada a UM afiliado ou a nenhum, nunca a dois):
//  1. Marca no checkout: a venda chegou da plataforma com utm_content = aff_<código> → vale ela (é a prova mais direta).
//  2. Marca no lead: se a venda não trouxe marca, vale o último lead com o e-mail do comprador (criado até o dia da venda) que tinha marca de afiliado.
//  3. Se as duas existem e divergem, vale a do checkout e a venda é sinalizada como "conflito" para você conferir.
//  4. Marca com código que não existe (digitado errado, afiliado apagado) não é creditada a ninguém e aparece como "código desconhecido".
//  Reembolso segue o afiliado da venda original (mesma transação); sem original, segue as mesmas regras.

export const PREFIXO_MARCA = "aff_";
export const marcaDoAfiliado = (codigo: string) => `${PREFIXO_MARCA}${codigo}`;
export const codigoDaMarca = (utmContent: string | null | undefined): string | null => {
  const m = /^aff_([a-z0-9]{3,24})$/i.exec((utmContent ?? "").trim());
  return m ? m[1].toLowerCase() : null;
};

/** Código do afiliado: só letras e números (3 a 24), a partir do nome; `sufixo` desempata quando já existe. */
export function codigoAfiliado(nome: string, sufixo = ""): string | null {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18);
  const c = `${base}${sufixo}`.slice(0, 24);
  return c.length >= 3 ? c : null;
}

/** As UTM do link do afiliado. O utm_content com o código é o que identifica a pessoa em tudo (visita, lead e venda). */
export const utmDoAfiliado = (codigo: string, slugQuiz: string) => ({
  utm_source: "afiliado", utm_medium: "link", utm_campaign: slugQuiz.slice(0, 60), utm_content: marcaDoAfiliado(codigo),
});

export interface AfiliadoBase { id: string; codigo: string; nome: string; comissao_pct: number; ativo: boolean }
export interface LeadAfi { id: string; email: string | null; criada_em: string; utm?: Record<string, string> | null }
export interface EventoAfi { sessao: string; criado_em: string; utm?: Record<string, string> | null }
export interface VendaAfi { transacao_id: string; tipo: string; comprador_email: string | null; valor: number | null; data: string | null; utm_content: string | null }
export type Via = "checkout" | "lead" | "conflito" | "codigo_desconhecido" | "nenhuma";
export interface Atribuicao { venda: VendaAfi; codigo: string | null; via: Via; alternativo: string | null }

const email = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const fimDoDia = (d: string | null) => (d ? Date.parse(`${d.slice(0, 10)}T23:59:59-03:00`) : Number.POSITIVE_INFINITY);

/** Marca de afiliado do último lead desse e-mail criado até o dia da venda. */
function marcaDoLead(leads: LeadAfi[], mail: string, ate: number): string | null {
  if (!mail) return null;
  const candidatos = leads.filter((l) => email(l.email) === mail && Date.parse(l.criada_em) <= ate).sort((a, b) => Date.parse(b.criada_em) - Date.parse(a.criada_em));
  return candidatos.length ? codigoDaMarca(candidatos[0].utm?.utm_content) : null;
}

export function atribuirVendas(afiliados: Pick<AfiliadoBase, "codigo">[], leads: LeadAfi[], vendas: VendaAfi[]): Atribuicao[] {
  const conhecidos = new Set(afiliados.map((a) => a.codigo.toLowerCase()));
  const aplicar = (v: VendaAfi): Atribuicao => {
    const doCheckout = codigoDaMarca(v.utm_content);
    const doLead = marcaDoLead(leads, email(v.comprador_email), fimDoDia(v.data));
    const lead = doLead && conhecidos.has(doLead) ? doLead : null;
    if (doCheckout) {
      if (!conhecidos.has(doCheckout)) return { venda: v, codigo: lead, via: lead ? "lead" : "codigo_desconhecido", alternativo: doCheckout };
      return lead && lead !== doCheckout ? { venda: v, codigo: doCheckout, via: "conflito", alternativo: lead } : { venda: v, codigo: doCheckout, via: "checkout", alternativo: null };
    }
    return lead ? { venda: v, codigo: lead, via: "lead", alternativo: null } : { venda: v, codigo: null, via: "nenhuma", alternativo: null };
  };
  const vendasPrimeiro = vendas.filter((v) => v.tipo === "venda").map(aplicar);
  const porTransacao = new Map(vendasPrimeiro.map((a) => [a.venda.transacao_id, a]));
  const reembolsos = vendas.filter((v) => v.tipo !== "venda").map((v) => porTransacao.get(v.transacao_id) ? { ...porTransacao.get(v.transacao_id)!, venda: v } : aplicar(v));
  return [...vendasPrimeiro, ...reembolsos];
}

export interface ResumoAfiliado {
  codigo: string; visitas: number; leads: number; vendas: number; reembolsos: number; bruto: number; reembolsado: number; liquido: number; comissao: number; conversao: number;
  viaCheckout: number; viaLead: number; conflitos: number;
}
export interface ResumoGeral {
  porAfiliado: Map<string, ResumoAfiliado>;
  saude: { vendasDoQuiz: number; viaCheckout: number; viaLead: number; conflitos: number; codigoDesconhecido: number; semAfiliado: number; foraDoQuiz: number; comMarcaNoCheckout: number; totalVendas: number };
  atribuicoes: Atribuicao[];
}

/** Janela de datas (ms). A atribuição usa SEMPRE todos os leads (o lead pode ser de antes do período); só a contagem respeita a janela. */
export interface Janela { desde: number; ate: number }
const diaEmMs = (d: string | null) => (d ? Date.parse(`${d.slice(0, 10)}T12:00:00-03:00`) : NaN);
export const vendaNaJanela = (v: Pick<VendaAfi, "data">, j?: Janela) => !j || (diaEmMs(v.data) >= j.desde && diaEmMs(v.data) < j.ate);

export function resumirAfiliados(afiliados: AfiliadoBase[], eventosTodos: EventoAfi[], leadsTodos: LeadAfi[], vendasTodas: VendaAfi[], janela?: Janela): ResumoGeral {
  const noPeriodo = (iso: string) => !janela || (Date.parse(iso) >= janela.desde && Date.parse(iso) < janela.ate);
  const eventos = eventosTodos.filter((e) => noPeriodo(e.criado_em));
  const leads = leadsTodos.filter((l) => noPeriodo(l.criada_em));
  const atribuicoes = atribuirVendas(afiliados, leadsTodos, vendasTodas).filter((a) => vendaNaJanela(a.venda, janela));
  const por = new Map<string, ResumoAfiliado>(afiliados.map((a) => [a.codigo.toLowerCase(), { codigo: a.codigo, visitas: 0, leads: 0, vendas: 0, reembolsos: 0, bruto: 0, reembolsado: 0, liquido: 0, comissao: 0, conversao: 0, viaCheckout: 0, viaLead: 0, conflitos: 0 }]));
  // Visita = sessão única; a marca vale a da primeira vez que a sessão aparece (a UTM é fixada na entrada).
  const vistas = new Set<string>();
  for (const e of [...eventos].sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em))) {
    if (vistas.has(e.sessao)) continue;
    vistas.add(e.sessao);
    const r = por.get(codigoDaMarca(e.utm?.utm_content) ?? "");
    if (r) r.visitas++;
  }
  for (const l of leads) { const r = por.get(codigoDaMarca(l.utm?.utm_content) ?? ""); if (r) r.leads++; }
  const emailsLeads = new Set(leadsTodos.map((l) => email(l.email)).filter(Boolean));
  const saude = { vendasDoQuiz: 0, viaCheckout: 0, viaLead: 0, conflitos: 0, codigoDesconhecido: 0, semAfiliado: 0, foraDoQuiz: 0, comMarcaNoCheckout: 0, totalVendas: 0 };
  for (const a of atribuicoes) {
    const valor = a.venda.valor ?? 0;
    const ehVenda = a.venda.tipo === "venda";
    if (ehVenda) {
      saude.totalVendas++;
      if (codigoDaMarca(a.venda.utm_content)) saude.comMarcaNoCheckout++;
      if (a.via === "codigo_desconhecido") saude.codigoDesconhecido++;
      if (a.via === "nenhuma") { if (emailsLeads.has(email(a.venda.comprador_email))) saude.semAfiliado++; else saude.foraDoQuiz++; }
      if (a.codigo) { saude.vendasDoQuiz++; if (a.via === "checkout") saude.viaCheckout++; else if (a.via === "lead") saude.viaLead++; else if (a.via === "conflito") { saude.conflitos++; saude.viaCheckout++; } }
    }
    const r = a.codigo ? por.get(a.codigo.toLowerCase()) : undefined;
    if (!r) continue;
    if (ehVenda) { r.vendas++; r.bruto += valor; if (a.via === "checkout") r.viaCheckout++; else if (a.via === "lead") r.viaLead++; else if (a.via === "conflito") { r.viaCheckout++; r.conflitos++; } }
    else { r.reembolsos++; r.reembolsado += valor; }
  }
  for (const a of afiliados) {
    const r = por.get(a.codigo.toLowerCase())!;
    r.liquido = Math.round((r.bruto - r.reembolsado) * 100) / 100;
    r.comissao = Math.round(r.liquido * a.comissao_pct) / 100;
    r.conversao = r.visitas ? r.vendas / r.visitas : 0;
  }
  return { porAfiliado: por, saude, atribuicoes };
}
