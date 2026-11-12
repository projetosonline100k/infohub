// Painel do quiz (11/11/2026, Davi: "uma visualização desse tipo, com essas funções"): as contas por trás dos números
// (visitas, funil, tendência contra o período anterior, insight, leads por etapa). Sem React nem importações: testável.

export type UtmLida = { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string } | null;
export interface EventoQuiz { sessao: string; tipo: "visita" | "passo" | "fim" | "cta"; passo: number; criado_em: string; utm?: UtmLida }
export type StatusLead = "novo" | "em_contato" | "convertido";
export interface LeadQuiz {
  id: string; perfil: string | null; nome: string | null; email: string | null; whatsapp: string | null; criada_em: string;
  respostas: { pergunta: string; resposta: string | null }[]; status: StatusLead; utm?: UtmLida; sessao?: string | null;
}
export interface PassoInfo { rotulo: string; tipo: "intro" | "pergunta" | "tela" | "captura" | "fim" }
export interface Janela { visitas: number; comecaram: number; terminaram: number; leads: number; cta: number }
export interface Painel {
  atual: Janela; anterior: Janela | null;
  funil: { rotulo: string; tipo: PassoInfo["tipo"]; n: number }[];
  pior: number;   // índice do passo onde mais gente sai (-1 se não há)
  porDia: { dia: string; n: number }[];
}

const DIA = 86_400_000;
const dia = (t: number) => new Date(t).toISOString().slice(0, 10);

/** `dias` = 0 → desde sempre (sem período anterior). */
export function calcularPainel(p: { passos: PassoInfo[]; eventos: EventoQuiz[]; leads: LeadQuiz[]; dias: number; agora?: number }): Painel {
  const agora = p.agora ?? Date.now();
  const inicio = p.dias ? agora - p.dias * DIA : 0;
  const inicioAnterior = p.dias ? agora - 2 * p.dias * DIA : 0;
  // Cada sessão vale no dia do primeiro evento dela.
  const sessoes = new Map<string, { t: number; visita: boolean; max: number; fim: boolean; cta: boolean }>();
  for (const e of p.eventos) {
    const t = Date.parse(e.criado_em);
    const s = sessoes.get(e.sessao) ?? { t, visita: false, max: 0, fim: false, cta: false };
    s.t = Math.min(s.t, t);
    if (e.tipo === "visita") s.visita = true;
    if (e.tipo === "passo") s.max = Math.max(s.max, e.passo);
    if (e.tipo === "fim") s.fim = true;
    if (e.tipo === "cta") s.cta = true;
    sessoes.set(e.sessao, s);
  }
  const janela = (de: number, ate: number): { j: Janela; lista: { t: number; max: number }[] } => {
    const dentro = [...sessoes.values()].filter((s) => s.visita && s.t >= de && s.t < ate);
    return {
      j: {
        visitas: dentro.length, comecaram: dentro.filter((s) => s.max >= 1).length, terminaram: dentro.filter((s) => s.fim).length,
        cta: dentro.filter((s) => s.cta).length,
        leads: p.leads.filter((l) => { const t = Date.parse(l.criada_em); return t >= de && t < ate; }).length,
      },
      lista: dentro,
    };
  };
  const cur = janela(inicio, agora + 1);
  const ant = p.dias ? janela(inicioAnterior, inicio).j : null;
  const funil = p.passos.map((s, i) => ({ rotulo: s.rotulo, tipo: s.tipo, n: cur.lista.filter((x) => x.max >= i).length }));
  let pior = -1, perda = 0;
  for (let i = 1; i < funil.length; i++) {
    const d = funil[i - 1].n - funil[i].n;
    if (d > perda) { perda = d; pior = i; }
  }
  const n = p.dias || 14;
  const porDia = Array.from({ length: n }, (_, k) => {
    const d = dia(agora - (n - 1 - k) * DIA);
    return { dia: d, n: [...sessoes.values()].filter((s) => s.visita && dia(s.t) === d).length };
  });
  return { atual: cur.j, anterior: ant, funil, pior, porDia };
}

/** "+120%", "-30%", "novo" (antes era zero) ou null (sem como comparar). */
export function variacao(atual: number, anterior: number | undefined | null): { texto: string; sobe: boolean } | null {
  if (anterior == null) return null;
  if (anterior === 0) return atual > 0 ? { texto: "novo", sobe: true } : null;
  const v = Math.round(((atual - anterior) / anterior) * 100);
  return { texto: `${v > 0 ? "+" : ""}${v}%`, sobe: v >= 0 };
}

export const porcento = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** A recomendação para a tela que mais perde gente. */
export function insightDoPior(painel: Painel): string | null {
  if (painel.pior < 1) return null;
  const passo = painel.funil[painel.pior];
  const perdeu = painel.funil[painel.pior - 1].n - passo.n;
  if (!perdeu) return null;
  const pc = porcento(perdeu, painel.funil[painel.pior - 1].n);
  if (passo.tipo === "tela") return `A tela de respiro concentra o maior abandono (${pc}% saem aqui). Experimente deixá-la mais curta e com um CTA claro para a próxima etapa.`;
  if (passo.tipo === "captura") return `O pedido de contato perde ${pc}% de quem chega nele. Peça só o WhatsApp, explique para que serve ou mova para depois de uma tela de resultado parcial.`;
  if (passo.tipo === "pergunta") return `Esta pergunta perde ${pc}% de quem chega nela. Simplifique o texto, reduza as opções ou troque a ordem.`;
  if (passo.tipo === "fim") return `${pc}% saem antes do resultado. Confira se a tela de carregamento não demora e se a promessa do começo aparece aqui.`;
  return `A abertura perde ${pc}% dos visitantes. Teste um título mais direto e uma imagem mais forte.`;
}

/** Onde a pessoa estava: "Terminou" ou a última pergunta respondida. */
export function etapaDoLead(l: Pick<LeadQuiz, "respostas">, perguntas: string[]): string {
  const n = l.respostas?.length ?? 0;
  if (n >= perguntas.length) return "Terminou";
  return n ? `P${n}. ${perguntas[n - 1] ?? ""}`.trim() : "Abertura";
}

/** Para cada pergunta, quantas pessoas escolheram cada resposta (na ordem em que as perguntas aparecem). */
export function agruparRespostas(leads: Pick<LeadQuiz, "respostas">[]): { pergunta: string; total: number; opcoes: [string, number][] }[] {
  const mapa = new Map<string, Map<string, number>>();
  for (const l of leads) {
    for (const r of l.respostas ?? []) {
      const m = mapa.get(r.pergunta) ?? new Map<string, number>();
      const k = r.resposta ?? "—";
      m.set(k, (m.get(k) ?? 0) + 1);
      mapa.set(r.pergunta, m);
    }
  }
  return [...mapa.entries()].map(([pergunta, m]) => ({ pergunta, total: [...m.values()].reduce((a, b) => a + b, 0), opcoes: [...m.entries()].sort((a, b) => b[1] - a[1]) }));
}

const aspas = (v: string) => `"${v.replace(/"/g, '""')}"`;
export function leadsParaCsv(leads: LeadQuiz[], perguntas: string[]): string {
  const cab = ["Data", "Nome", "E-mail", "WhatsApp", "Perfil", "Etapa", "Status"];
  const linhas = leads.map((l) => [l.criada_em.slice(0, 16).replace("T", " "), l.nome ?? "", l.email ?? "", l.whatsapp ?? "", l.perfil ?? "", etapaDoLead(l, perguntas), l.status].map(aspas).join(","));
  return [cab.map(aspas).join(","), ...linhas].join("\n");
}


// ---------------------------------------------------------------- Origem do tráfego (UTM)

export interface LinhaOrigem { source: string; medium: string; campaign: string; content: string; visitas: number; leads: number; terminaram: number }
const chaveOrigem = (u: UtmLida | undefined) => [u?.utm_source ?? "", u?.utm_medium ?? "", u?.utm_campaign ?? "", u?.utm_content ?? ""] as const;

/** Visitas, terminaram e leads por origem (source/medium/campaign/content). Sem UTM = tudo vazio ("direto"). */
export function origens(eventos: EventoQuiz[], leads: Pick<LeadQuiz, "utm">[]): LinhaOrigem[] {
  const mapa = new Map<string, LinhaOrigem>();
  const linha = (u: UtmLida | undefined) => {
    const [source, medium, campaign, content] = chaveOrigem(u);
    const k = [source, medium, campaign, content].join("|");
    let l = mapa.get(k);
    if (!l) { l = { source, medium, campaign, content, visitas: 0, leads: 0, terminaram: 0 }; mapa.set(k, l); }
    return l;
  };
  const utmDaSessao = new Map<string, UtmLida | undefined>();
  for (const e of eventos) if (e.tipo === "visita") utmDaSessao.set(e.sessao, e.utm);
  for (const [, u] of utmDaSessao) linha(u).visitas++;
  for (const e of eventos) if (e.tipo === "fim" && utmDaSessao.has(e.sessao)) linha(utmDaSessao.get(e.sessao)).terminaram++;
  for (const l of leads) linha(l.utm).leads++;
  return [...mapa.values()].sort((a, b) => b.visitas - a.visitas || b.leads - a.leads);
}

interface LinkUtm { utm_source: string; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null }
/** A linha da origem é deste link? Compara só o que o link define (source sempre; o resto, se preenchido). */
export function ehDoLink(l: LinkUtm, o: { source: string; medium: string; campaign: string; content: string }): boolean {
  return o.source === l.utm_source && (!l.utm_medium || o.medium === l.utm_medium) && (!l.utm_campaign || o.campaign === l.utm_campaign) && (!l.utm_content || o.content === l.utm_content);
}
export function estatisticaDoLink(l: LinkUtm, linhas: LinhaOrigem[]) {
  const d = linhas.filter((o) => ehDoLink(l, o));
  const visitas = d.reduce((s, o) => s + o.visitas, 0), leads = d.reduce((s, o) => s + o.leads, 0), terminaram = d.reduce((s, o) => s + o.terminaram, 0);
  return { visitas, leads, terminaram, conversao: porcento(leads, visitas) };
}
/** Vendas (da Eduzz/Kiwify/Hotmart) que vieram com a UTM deste link. */
export function vendasDoLink(l: LinkUtm, vendas: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; valor: number | null }[]) {
  const d = vendas.filter((v) => ehDoLink(l, { source: v.utm_source ?? "", medium: v.utm_medium ?? "", campaign: v.utm_campaign ?? "", content: v.utm_content ?? "" }));
  return { n: d.length, total: d.reduce((s, v) => s + Number(v.valor ?? 0), 0) };
}


// ---------------------------------------------------------------- Conversão (checkout e compra)

export interface VendaPlataforma { transacao_id?: string | null; tipo: string; comprador_email: string | null; valor: number | null; data: string }
export interface EstadoCompra { clicouCheckout: boolean; compra: { valor: number; data: string } | null }
const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/**
 * Para cada lead: clicou na oferta (evento "cta" da mesma sessão da visita) e comprou (venda com o e-mail dele, sem reembolso).
 * A venda vem da Eduzz/Kiwify/Hotmart; o elo é o e-mail que a pessoa deixou no quiz.
 */
export function estadoDosLeads(leads: Pick<LeadQuiz, "id" | "email" | "sessao">[], eventos: Pick<EventoQuiz, "sessao" | "tipo">[], vendas: VendaPlataforma[]): Map<string, EstadoCompra> {
  const cta = new Set(eventos.filter((e) => e.tipo === "cta").map((e) => e.sessao));
  const reembolsadas = new Set(vendas.filter((v) => v.tipo === "reembolso" && v.transacao_id).map((v) => v.transacao_id as string));
  const porEmail = new Map<string, { valor: number; data: string }>();
  for (const v of vendas) {
    if (v.tipo !== "venda" || !v.comprador_email || (v.transacao_id && reembolsadas.has(v.transacao_id))) continue;
    const k = normEmail(v.comprador_email);
    const at = porEmail.get(k);
    porEmail.set(k, { valor: (at?.valor ?? 0) + Number(v.valor ?? 0), data: at && at.data > v.data ? at.data : v.data });
  }
  const r = new Map<string, EstadoCompra>();
  for (const l of leads) {
    const compra = l.email ? porEmail.get(normEmail(l.email)) ?? null : null;
    r.set(l.id, { clicouCheckout: !!l.sessao && cta.has(l.sessao) || !!compra, compra });   // quem comprou, no mínimo passou pelo checkout
  }
  return r;
}

export interface ResumoConversao { leads: number; clicaram: number; compraram: number; receita: number; quentes: number }
/** Os números do período: leads, quantos chegaram ao checkout, quantos compraram, a receita e os "quentes" (clicaram e não compraram). */
export function resumoConversao(leads: Pick<LeadQuiz, "id" | "criada_em">[], estados: Map<string, EstadoCompra>, dias: number, agora = Date.now()): ResumoConversao {
  const inicio = dias ? agora - dias * 86_400_000 : 0;
  const r: ResumoConversao = { leads: 0, clicaram: 0, compraram: 0, receita: 0, quentes: 0 };
  for (const l of leads) {
    if (Date.parse(l.criada_em) < inicio) continue;
    r.leads++;
    const e = estados.get(l.id);
    if (!e) continue;
    if (e.clicouCheckout) r.clicaram++;
    if (e.compra) { r.compraram++; r.receita += e.compra.valor; }
    else if (e.clicouCheckout) r.quentes++;
  }
  return r;
}
