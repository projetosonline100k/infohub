// Painel de Tráfego estilo UTMify (20/11/2026): custos e lucro líquido, aprovação por pagamento, reembolso, abandono, quebras por
// método/plano/dia da semana/hora/UTM, série por dia, vendas ao vivo e ranking de criativos. Lógica pura (sem React): testável em Node.
// Tudo que vem das vendas funciona sem a Meta; o que depende de gasto recebe `null` (a tela mostra "—").
import { nomeDoUtm, normalizarNome, resolverOrigem, somarDias, type Estrutura, type InsightDia, type LinhaTrafego, type Nivel, type UtmBruta } from "./atribuicao";

export interface Custos { taxaPct: number; impostoPct: number; outrosDia: number }
export const custosZero = (): Custos => ({ taxaPct: 0, impostoPct: 0, outrosDia: 0 });
/** Limpa o que o usuário digitou: nunca negativo, porcentagem no máximo 100. */
export function custosValidos(c: Partial<Custos> | null | undefined): Custos {
  const n = (v: unknown, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0; };
  return { taxaPct: n(c?.taxaPct, 100), impostoPct: n(c?.impostoPct, 100), outrosDia: n(c?.outrosDia, 1e9) };
}

export interface EventoVenda extends UtmBruta {
  transacao_id: string; plataforma?: string | null; tipo: string; valor: number | string | null; data: string; recebido_em: string;
  produto_plataforma?: string | null; metodo_pagamento?: string | null; comprador_nome?: string | null;
}

// ---------- fuso (America/Sao_Paulo = UTC−3, sem horário de verão desde 2019)
const brasilia = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000);
export const horaBrasilia = (iso: string): number => brasilia(iso).getUTCHours();
export const diaBrasiliaDe = (iso: string): string => brasilia(iso).toISOString().slice(0, 10);
export const diaDaSemana = (dia: string): number => new Date(`${dia}T12:00:00Z`).getUTCDay();   // 0 = domingo
export const NOMES_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const diasEntre = (de: string, ate: string): number => Math.max(1, Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1);
/** O período imediatamente antes, com o mesmo tamanho. */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } { const n = diasEntre(de, ate); return { de: somarDias(de, -n), ate: somarDias(de, -1) }; }
/** Variação em relação ao período anterior (0,25 = +25%). Sem base de comparação (zero ou ausente) = null. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || !Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

// ---------- transações
export const HORAS_PENDENTE_VENCIDA = 24;   // Pix/boleto/cartão pendente há mais que isso conta como não aprovado na taxa de aprovação
export type StatusTransacao = "aprovada" | "cancelada" | "pendente" | "vencida";
export interface Transacao { ev: EventoVenda; status: StatusTransacao; dia: string; valor: number }
export interface Preparado { transacoes: Transacao[]; reembolsos: { ev: EventoVenda; dia: string; valor: number }[]; abandonos: { ev: EventoVenda; dia: string }[] }
const num = (v: unknown) => Math.abs(Number(v) || 0);

/** Junta as linhas da mesma compra (a plataforma manda "pendente" e depois "venda" ou "cancelada"): vale a mais avançada. */
export function preparar(eventos: EventoVenda[], agora = Date.now()): Preparado {
  const prioridade = (t: string) => (t === "venda" ? 3 : t === "cancelada" || t === "recusada" ? 2 : t === "pendente" ? 1 : 0);
  const melhor = new Map<string, EventoVenda>();
  const p: Preparado = { transacoes: [], reembolsos: [], abandonos: [] };
  for (const e of eventos) {
    const dia = String(e.data ?? "").slice(0, 10);
    if (e.tipo === "reembolso") { p.reembolsos.push({ ev: e, dia, valor: num(e.valor) }); continue; }
    if (e.tipo === "abandono") { p.abandonos.push({ ev: e, dia }); continue; }
    const pr = prioridade(e.tipo);
    if (!pr) continue;
    const k = `${e.plataforma ?? ""}|${e.transacao_id}`;
    const atual = melhor.get(k);
    if (!atual || pr > prioridade(atual.tipo)) melhor.set(k, e);
  }
  for (const e of melhor.values()) {
    const idadeH = (agora - Date.parse(e.recebido_em)) / 3600_000;
    const status: StatusTransacao = e.tipo === "venda" ? "aprovada" : e.tipo === "pendente" ? (idadeH > HORAS_PENDENTE_VENCIDA ? "vencida" : "pendente") : "cancelada";
    p.transacoes.push({ ev: e, status, dia: String(e.data ?? "").slice(0, 10), valor: num(e.valor) });
  }
  return p;
}
const noPeriodo = (dia: string, de: string, ate: string) => dia >= de && dia <= ate;

// ---------- resumo (cards)
export interface Resumo {
  bruto: number; aprovadas: number; ticketMedio: number | null;
  reembolsosN: number; reembolsosValor: number; pctReembolso: number | null;
  faturamento: number;            // bruto − reembolsos (o "faturamento" da tabela)
  taxas: number; impostos: number; outros: number;
  receitaLiquida: number;         // faturamento − taxas − impostos (antes do gasto de anúncios)
  gasto: number | null;           // null = Meta sem dados
  lucro: number | null; margem: number | null; roi: number | null; roas: number | null; cpa: number | null;
  canceladas: number; pendentes: number; pendentesVencidas: number; taxaAprovacao: number | null;
  abandonos: number;
}
/** Regras: taxa da plataforma sobre as vendas aprovadas (o reembolso não devolve a taxa); imposto sobre o faturamento depois do reembolso;
 *  "outros custos" = valor por dia × dias do período. Lucro líquido = receita líquida − gasto − outros. ROI = lucro ÷ (gasto + taxas + impostos + outros). */
export function calcularResumo(p: Preparado, custos: Custos, gasto: number | null, de: string, ate: string): Resumo {
  const c = custosValidos(custos);
  let bruto = 0, aprovadas = 0, canceladas = 0, pendentes = 0, vencidas = 0;
  for (const t of p.transacoes) {
    if (!noPeriodo(t.dia, de, ate)) continue;
    if (t.status === "aprovada") { aprovadas++; bruto += t.valor; }
    else if (t.status === "cancelada") canceladas++;
    else if (t.status === "vencida") vencidas++;
    else pendentes++;
  }
  let reembolsosN = 0, reembolsosValor = 0;
  for (const r of p.reembolsos) if (noPeriodo(r.dia, de, ate)) { reembolsosN++; reembolsosValor += r.valor; }
  const abandonos = p.abandonos.filter((a) => noPeriodo(a.dia, de, ate)).length;
  const faturamento = bruto - reembolsosValor;
  const taxas = bruto * c.taxaPct / 100, impostos = faturamento * c.impostoPct / 100, outros = c.outrosDia * diasEntre(de, ate);
  const receitaLiquida = faturamento - taxas - impostos;
  const lucro = gasto === null ? null : receitaLiquida - gasto - outros;
  const custoTotal = (gasto ?? 0) + taxas + impostos + outros;
  const denom = aprovadas + canceladas + vencidas;
  return {
    bruto, aprovadas, ticketMedio: aprovadas ? bruto / aprovadas : null, reembolsosN, reembolsosValor, pctReembolso: bruto > 0 ? reembolsosValor / bruto : null,
    faturamento, taxas, impostos, outros, receitaLiquida, gasto, lucro,
    margem: lucro !== null && faturamento > 0 ? lucro / faturamento : null,
    roi: lucro !== null && custoTotal > 0 ? lucro / custoTotal : null,
    roas: gasto !== null && gasto > 0 ? faturamento / gasto : null,
    cpa: gasto !== null && aprovadas > 0 ? gasto / aprovadas : null,
    canceladas, pendentes, pendentesVencidas: vencidas, taxaAprovacao: denom > 0 ? aprovadas / denom : null, abandonos,
  };
}

// ---------- gasto da Meta (null = a Meta ainda não trouxe nada: a tela mostra "—" em vez de inventar zero)
const dentro = (dia: string, de: string, ate: string) => dia >= de && dia <= ate;
export function somaGasto(campanhas: InsightDia[], de: string, ate: string): number | null {
  if (!campanhas.length) return null;
  return campanhas.reduce((s, i) => (dentro(i.dia, de, ate) ? s + (+i.gasto || 0) : s), 0);
}
export function gastoPorDia(campanhas: InsightDia[], de: string, ate: string): Map<string, number> | null {
  if (!campanhas.length) return null;
  const m = new Map<string, number>();
  for (const i of campanhas) if (dentro(i.dia, de, ate)) m.set(i.dia, (m.get(i.dia) ?? 0) + (+i.gasto || 0));
  return m;
}
export function gastosPorNivel(insights: Record<Nivel, InsightDia[]>, de: string, ate: string): GastosPorNivel | null {
  if (!insights.campanha.length && !insights.conjunto.length && !insights.anuncio.length) return null;
  const r: GastosPorNivel = { campanha: new Map(), conjunto: new Map(), anuncio: new Map() };
  for (const nivel of ["campanha", "conjunto", "anuncio"] as const) for (const i of insights[nivel] ?? []) if (dentro(i.dia, de, ate)) r[nivel].set(i.ref, (r[nivel].get(i.ref) ?? 0) + (+i.gasto || 0));
  return r;
}

// ---------- quebras
export interface LinhaQuebra {
  chave: string; rotulo: string; aprovadas: number; faturamento: number; canceladas: number; pendentes: number; reembolsosN: number;
  taxaAprovacao: number | null; gasto: number | null; roas: number | null;
}
export type GastosPorNivel = { campanha: Map<string, number>; conjunto: Map<string, number>; anuncio: Map<string, number> };
const ROTULO_METODO: Record<string, string> = { pix: "Pix", creditcard: "Cartão de crédito", credit_card: "Cartão de crédito", boleto: "Boleto", billet: "Boleto", debitcard: "Cartão de débito", paypal: "PayPal" };
export const rotuloMetodo = (m: string | null | undefined): string => { const k = String(m ?? "").trim(); return k ? (ROTULO_METODO[k.toLowerCase()] ?? k) : "Não informado"; };
const novaLinha = (chave: string, rotulo: string): LinhaQuebra => ({ chave, rotulo, aprovadas: 0, faturamento: 0, canceladas: 0, pendentes: 0, reembolsosN: 0, taxaAprovacao: null, gasto: null, roas: null });
function fechar(l: LinhaQuebra, vencidas: number) {
  const denom = l.aprovadas + l.canceladas + vencidas;
  l.taxaAprovacao = denom > 0 ? l.aprovadas / denom : null;
  l.roas = l.gasto !== null && l.gasto > 0 ? l.faturamento / l.gasto : null;
}
type ChaveFn = (ev: EventoVenda, dia: string) => { chave: string; rotulo: string } | null;
/** Agrupa as transações (e reembolsos) do período por uma chave. */
export function quebrar(p: Preparado, de: string, ate: string, chaveDe: ChaveFn, ordem: "faturamento" | "chave" = "faturamento", fixas?: { chave: string; rotulo: string }[]): LinhaQuebra[] {
  const grupos = new Map<string, LinhaQuebra>(); const vencidas = new Map<string, number>();
  const pegar = (k: { chave: string; rotulo: string }) => { let g = grupos.get(k.chave); if (!g) { g = novaLinha(k.chave, k.rotulo); grupos.set(k.chave, g); } return g; };
  for (const f of fixas ?? []) grupos.set(f.chave, novaLinha(f.chave, f.rotulo));
  for (const t of p.transacoes) {
    if (!noPeriodo(t.dia, de, ate)) continue;
    const k = chaveDe(t.ev, t.dia); if (!k) continue;
    const g = pegar(k);
    if (t.status === "aprovada") { g.aprovadas++; g.faturamento += t.valor; }
    else if (t.status === "cancelada") g.canceladas++;
    else { g.pendentes++; if (t.status === "vencida") vencidas.set(k.chave, (vencidas.get(k.chave) ?? 0) + 1); }
  }
  for (const r of p.reembolsos) {
    if (!noPeriodo(r.dia, de, ate)) continue;
    const k = chaveDe(r.ev, r.dia); if (!k) continue;
    const g = pegar(k); g.reembolsosN++; g.faturamento -= r.valor;
  }
  const lista = [...grupos.values()];
  for (const l of lista) fechar(l, vencidas.get(l.chave) ?? 0);
  return ordem === "chave" ? lista : lista.sort((a, b) => b.faturamento - a.faturamento || b.aprovadas - a.aprovadas);
}
export const quebrarPorMetodo = (p: Preparado, de: string, ate: string) => quebrar(p, de, ate, (e) => ({ chave: String(e.metodo_pagamento ?? "").trim().toLowerCase() || "?", rotulo: rotuloMetodo(e.metodo_pagamento) }));
export const quebrarPorProduto = (p: Preparado, de: string, ate: string) => quebrar(p, de, ate, (e) => { const n = String(e.produto_plataforma ?? "").trim(); return { chave: normalizarNome(n) || "?", rotulo: n || "Sem plano informado" }; });
export const quebrarPorDiaSemana = (p: Preparado, de: string, ate: string) => quebrar(p, de, ate, (_e, dia) => { const d = diaDaSemana(dia); return { chave: String(d), rotulo: NOMES_SEMANA[d] }; }, "chave", NOMES_SEMANA.map((r, i) => ({ chave: String(i), rotulo: r })));
/** Hora do dia em Brasília (de 0h a 23h), pelo horário em que o evento chegou. */
export const quebrarPorHora = (p: Preparado, de: string, ate: string) => quebrar(p, de, ate, (e) => { const h = horaBrasilia(e.recebido_em); return { chave: String(h), rotulo: `${String(h).padStart(2, "0")}h` }; }, "chave", Array.from({ length: 24 }, (_, h) => ({ chave: String(h), rotulo: `${String(h).padStart(2, "0")}h` })));

export type CampoUtm = "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term";
export const CAMPOS_UTM: { campo: CampoUtm; rotulo: string }[] = [
  { campo: "utm_source", rotulo: "Origem (source)" }, { campo: "utm_medium", rotulo: "Conjunto (medium)" }, { campo: "utm_campaign", rotulo: "Campanha" },
  { campo: "utm_content", rotulo: "Anúncio (content)" }, { campo: "utm_term", rotulo: "Posicionamento (term)" },
];
const ehModelo = (v: string) => /\{\{.*\}\}/.test(v);
/** Por UTM. O texto "nome|id" é mostrado só pelo nome. Com `est`/`gastos`, traz o gasto da campanha/conjunto/anúncio que o texto identifica (source e term: sem gasto). */
export function quebrarPorUtm(p: Preparado, de: string, ate: string, campo: CampoUtm, est?: Estrutura, gastos?: GastosPorNivel | null): LinhaQuebra[] {
  const amostras = new Map<string, UtmBruta>();
  const lista = quebrar(p, de, ate, (e) => {
    const bruto = String(e[campo] ?? "").trim();
    if (!bruto) return { chave: "", rotulo: "(sem UTM)" };
    if (ehModelo(bruto)) return { chave: "modelo", rotulo: "(parâmetro da Meta não substituído)" };
    const nome = nomeDoUtm(bruto);
    if (!amostras.has(nome)) amostras.set(nome, e);
    const partes = bruto.split("|"); const rotulo = (partes.length > 1 && /\d{6,}\s*$/.test(partes[partes.length - 1]) ? partes.slice(0, -1).join("|") : bruto).trim();
    return { chave: nome, rotulo: rotulo || bruto };
  });
  if (est && gastos && (campo === "utm_campaign" || campo === "utm_medium" || campo === "utm_content")) {
    const nivel = campo === "utm_campaign" ? "campanha" : campo === "utm_medium" ? "conjunto" : "anuncio";
    for (const l of lista) {
      const u = amostras.get(l.chave); if (!u) continue;
      const o = resolverOrigem(u, est);
      const ref = nivel === "campanha" ? o.campanha_ref : nivel === "conjunto" ? o.conjunto_ref : o.anuncio_ref;
      if (ref && o.estado !== "ambiguo") { l.gasto = gastos[nivel].get(ref) ?? 0; l.roas = l.gasto > 0 ? l.faturamento / l.gasto : null; }
    }
  }
  return lista;
}

// ---------- série por dia
export interface PontoDia { dia: string; gasto: number | null; faturamento: number; lucro: number | null }
export function serieDiaria(p: Preparado, custos: Custos, gastoPorDia: Map<string, number> | null, de: string, ate: string): PontoDia[] {
  const saida: PontoDia[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const g = gastoPorDia ? (gastoPorDia.get(d) ?? 0) : null;
    const r = calcularResumo(p, custos, g, d, d);
    saida.push({ dia: d, gasto: g, faturamento: r.faturamento, lucro: r.lucro });
  }
  return saida;
}

// ---------- vendas ao vivo
export type StatusAoVivo = "aprovada" | "pendente" | "vencida" | "cancelada" | "reembolso" | "abandono";
export interface VendaAoVivo { id: string; quando: string; produto: string; valor: number | null; metodo: string; status: StatusAoVivo; origem: string; comprador: string }
/** Nome do anúncio/conjunto/campanha de origem; sem a Meta, o texto da UTM; sem UTM, "Sem origem". */
export function rotuloOrigem(u: UtmBruta, est: Estrutura): string {
  const o = resolverOrigem(u, est);
  if (o.estado === "anuncio") return est.anuncios.find((a) => a.ref === o.anuncio_ref)?.nome ?? "Anúncio";
  if (o.estado === "conjunto") return `Conjunto: ${est.conjuntos.find((c) => c.ref === o.conjunto_ref)?.nome ?? "?"}`;
  if (o.estado === "campanha") return `Campanha: ${est.campanhas.find((c) => c.ref === o.campanha_ref)?.nome ?? "?"}`;
  if (o.estado === "ambiguo") return "Ambíguo (mesmo nome em mais de um anúncio)";
  if (o.estado === "sem_origem") return "Sem origem";
  const texto = [u.utm_content, u.utm_campaign].map((v) => nomeDoUtm(v)).find((v) => v && !ehModelo(v));
  return texto ? `UTM: ${texto}` : "Sem origem";
}
/** Últimas movimentações (mais novas primeiro). Só nome do comprador: telefone e e-mail nem chegam aqui. */
export function vendasAoVivo(p: Preparado, est: Estrutura, limite = 30): VendaAoVivo[] {
  const l: VendaAoVivo[] = [];
  const base = (e: EventoVenda, status: StatusAoVivo, valor: number | null, id: string): VendaAoVivo => ({
    id, quando: e.recebido_em, produto: String(e.produto_plataforma ?? "").trim() || "—", valor, metodo: e.tipo === "abandono" ? "—" : rotuloMetodo(e.metodo_pagamento), status,
    origem: rotuloOrigem(e, est), comprador: String(e.comprador_nome ?? "").trim() || "—",
  });
  for (const t of p.transacoes) l.push(base(t.ev, t.status, t.valor, `t:${t.ev.plataforma}:${t.ev.transacao_id}`));
  for (const r of p.reembolsos) l.push(base(r.ev, "reembolso", -r.valor, `r:${r.ev.plataforma}:${r.ev.transacao_id}`));
  for (const a of p.abandonos) l.push(base(a.ev, "abandono", a.ev.valor === null ? null : num(a.ev.valor), `a:${a.ev.plataforma}:${a.ev.transacao_id}`));
  return l.sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando)).slice(0, limite);
}

// ---------- ranking de criativos
export type CriterioRanking = "roas" | "lucro" | "custoPorVenda";
export type SeloCriativo = "melhor" | "lucrando" | "queimando" | null;
export interface CriativoRank { linha: LinhaTrafego; lucroLiquido: number; selo: SeloCriativo; motivo: string }
export const MULTIPLO_SEM_VENDA = 2;   // regra visível na tela: gastou mais que 2× o ticket médio e não vendeu
export const QTD_MELHORES = 3;
export function rankingCriativos(linhas: LinhaTrafego[], custos: Custos, ticketMedio: number | null, criterio: CriterioRanking): CriativoRank[] {
  const c = custosValidos(custos);
  const itens = linhas.filter((l) => l.nivel === "anuncio" && (l.gasto > 0 || l.vendas > 0)).map((l) => ({ linha: l, lucroLiquido: l.faturamento * (1 - (c.taxaPct + c.impostoPct) / 100) - l.gasto }));
  const valor = (x: { linha: LinhaTrafego; lucroLiquido: number }) => (criterio === "roas" ? x.linha.roas : criterio === "lucro" ? x.lucroLiquido : x.linha.custoPorVenda);
  itens.sort((a, b) => {
    const x = valor(a), y = valor(b);
    if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1;
    return criterio === "custoPorVenda" ? x - y : y - x;
  });
  let melhores = 0;
  return itens.map((i) => {
    const l = i.linha;
    if (l.vendas <= 0 && ticketMedio !== null && l.gasto > MULTIPLO_SEM_VENDA * ticketMedio) return { ...i, selo: "queimando" as const, motivo: `Gastou mais de ${MULTIPLO_SEM_VENDA}× o ticket médio sem vender` };
    if (l.vendas > 0 && i.lucroLiquido > 0) {
      if (melhores < QTD_MELHORES) { melhores++; return { ...i, selo: "melhor" as const, motivo: "Entre os que mais dão resultado, com lucro" }; }
      return { ...i, selo: "lucrando" as const, motivo: "Com lucro" };
    }
    return { ...i, selo: null, motivo: "" };
  });
}
