// Hub de Tráfego (20/11/2026): casa venda, lead e visita do quiz com campanha → conjunto → anúncio da Meta pelos UTMs.
// Aceita os DOIS formatos: com ID (UTMify: "nome|id" em campaign/medium/content) e só por NOME (campanha do Instalivros:
// utm_content = nome do anúncio, utm_term = nome do conjunto). Ambiguidade nunca é chutada. Sem React nem importações: testável em Node.

export interface UtmBruta { utm_campaign?: string | null; utm_medium?: string | null; utm_content?: string | null; utm_term?: string | null; utm_source?: string | null }
export interface RefCampanha { ref: string; nome: string }
export interface RefConjunto { ref: string; nome: string; campanha_ref: string }
export interface RefAnuncio { ref: string; nome: string; conjunto_ref: string; campanha_ref: string }
export interface Estrutura { campanhas: RefCampanha[]; conjuntos: RefConjunto[]; anuncios: RefAnuncio[] }

export type EstadoOrigem = "anuncio" | "conjunto" | "campanha" | "ambiguo" | "sem_origem" | "nao_identificada";
export interface Origem { estado: EstadoOrigem; campanha_ref?: string; conjunto_ref?: string; anuncio_ref?: string }

/** Texto de UTM comparável: decodifica %20/+, tira acento e caixa, espaços repetidos. */
export function normalizarNome(v: string | null | undefined): string {
  let s = String(v ?? "");
  try { s = decodeURIComponent(s.replace(/\+/g, " ")); } catch { /* já estava decodificado */ }
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
/** O id numérico no fim de "nome|123456" (ou só "123456"). */
export function idDoUtm(utm: string | null | undefined): string | null {
  if (!utm) return null;
  const m = /(\d{6,})\s*$/.exec(normalizarNome(utm));
  return m ? m[1] : null;
}
/** A parte do nome de "nome|id" (sem o id). Sem "|" devolve o texto todo. */
export function nomeDoUtm(utm: string | null | undefined): string {
  const t = normalizarNome(utm);
  const i = t.lastIndexOf("|");
  return i >= 0 && idDoUtm(utm) ? t.slice(0, i).trim() : t;
}
const vazio = (v: string | null | undefined) => !v || !String(v).trim();
const ehModelo = (v: string | null | undefined) => /\{\{.*\}\}/.test(String(v ?? ""));   // macro da Meta que não foi trocada

export function temUtmDeAnuncio(u: UtmBruta | null | undefined): boolean {
  return !!u && [u.utm_campaign, u.utm_medium, u.utm_content, u.utm_term].some((v) => !vazio(v) && !ehModelo(v));
}

/** Descobre a campanha/conjunto/anúncio de uma venda, lead ou visita. */
export function resolverOrigem(u: UtmBruta | null | undefined, est: Estrutura): Origem {
  if (!temUtmDeAnuncio(u)) return { estado: "sem_origem" };
  const x = u as UtmBruta;
  const porRefAnuncio = new Map(est.anuncios.map((a) => [a.ref, a]));
  const porRefConjunto = new Map(est.conjuntos.map((c) => [c.ref, c]));
  const porRefCampanha = new Map(est.campanhas.map((c) => [c.ref, c]));

  // 1) por ID (formato UTMify): o mais específico que bater
  const idAd = idDoUtm(x.utm_content), idConj = idDoUtm(x.utm_medium) ?? idDoUtm(x.utm_term), idCamp = idDoUtm(x.utm_campaign);
  const ad = idAd ? porRefAnuncio.get(idAd) : undefined;
  if (ad) return { estado: "anuncio", anuncio_ref: ad.ref, conjunto_ref: ad.conjunto_ref, campanha_ref: ad.campanha_ref };
  const conjId = idConj ? porRefConjunto.get(idConj) : undefined;
  if (conjId) return { estado: "conjunto", conjunto_ref: conjId.ref, campanha_ref: conjId.campanha_ref };
  const campId = idCamp ? porRefCampanha.get(idCamp) : undefined;
  if (campId) return { estado: "campanha", campanha_ref: campId.ref };

  // 2) por NOME. O conjunto vem de utm_term ou utm_medium (o medium "anuncio" do Instalivros simplesmente não bate com nada).
  const nomesConjunto = [nomeDoUtm(x.utm_term), nomeDoUtm(x.utm_medium)].filter((n) => n && !ehModelo(n));
  const conjuntosPorNome = (): RefConjunto[] => {
    for (const n of nomesConjunto) { const l = est.conjuntos.filter((c) => normalizarNome(c.nome) === n); if (l.length) return l; }
    return [];
  };
  const nomeAd = nomeDoUtm(x.utm_content);
  if (nomeAd && !ehModelo(nomeAd)) {
    let cands = est.anuncios.filter((a) => normalizarNome(a.nome) === nomeAd);
    if (cands.length > 1) {   // mesmo nome em vários lugares: o conjunto desempata, se desempatar de verdade
      const conjs = new Set(conjuntosPorNome().map((c) => c.ref));
      const filtrados = conjs.size ? cands.filter((a) => conjs.has(a.conjunto_ref)) : [];
      if (filtrados.length >= 1) cands = filtrados;
    }
    if (cands.length === 1) { const a = cands[0]; return { estado: "anuncio", anuncio_ref: a.ref, conjunto_ref: a.conjunto_ref, campanha_ref: a.campanha_ref }; }
    if (cands.length > 1) return { estado: "ambiguo" };
  }
  const conjs = conjuntosPorNome();
  if (conjs.length === 1) return { estado: "conjunto", conjunto_ref: conjs[0].ref, campanha_ref: conjs[0].campanha_ref };
  if (conjs.length > 1) return { estado: "ambiguo" };
  const nomeCamp = nomeDoUtm(x.utm_campaign);
  if (nomeCamp && !ehModelo(nomeCamp)) {
    const camps = est.campanhas.filter((c) => normalizarNome(c.nome) === nomeCamp);
    if (camps.length === 1) return { estado: "campanha", campanha_ref: camps[0].ref };
    if (camps.length > 1) return { estado: "ambiguo" };
  }
  return { estado: "nao_identificada" };
}

// ---------- vendas
export interface VendaTrafego extends UtmBruta { tipo: string; valor: number | string | null; data: string; transacao_id?: string | null }
export interface Acumulo { vendas: number; faturamento: number }
export type Nivel = "campanha" | "conjunto" | "anuncio";
export interface VendasAtribuidas {
  porNivel: Record<Nivel, Map<string, Acumulo>>;
  /** Vendas que não entram em nenhuma linha da tabela (mesmo valor já está no total). */
  semOrigem: Acumulo; naoIdentificada: Acumulo; ambiguo: Acumulo;
  total: Acumulo;
  origens: Origem[];   // uma por venda considerada (mesma ordem de `consideradas`)
  consideradas: VendaTrafego[];
}
const novo = (): Acumulo => ({ vendas: 0, faturamento: 0 });
const somar = (a: Acumulo, sinal: number, valor: number) => { a.vendas += sinal; a.faturamento += sinal * valor; };

/** Atribui as vendas do período. Reembolso desconta; se não tem UTM própria, herda a da venda original (mesma transação). */
export function atribuirVendas(vendas: VendaTrafego[], est: Estrutura, de?: string, ate?: string): VendasAtribuidas {
  const originais = new Map<string, VendaTrafego>();
  for (const v of vendas) if (v.tipo !== "reembolso" && v.transacao_id) originais.set(v.transacao_id, v);
  const r: VendasAtribuidas = { porNivel: { campanha: new Map(), conjunto: new Map(), anuncio: new Map() }, semOrigem: novo(), naoIdentificada: novo(), ambiguo: novo(), total: novo(), origens: [], consideradas: [] };
  for (const v of vendas) {
    const dia = String(v.data ?? "").slice(0, 10);
    if ((de && dia < de) || (ate && dia > ate)) continue;
    if (v.tipo !== "venda" && v.tipo !== "reembolso") continue;
    const sinal = v.tipo === "reembolso" ? -1 : 1;
    const valor = Math.abs(Number(v.valor) || 0);
    const utm = v.tipo === "reembolso" && !temUtmDeAnuncio(v) && v.transacao_id ? (originais.get(v.transacao_id) ?? v) : v;
    const o = resolverOrigem(utm, est);
    r.origens.push(o); r.consideradas.push(v);
    somar(r.total, sinal, valor);
    if (o.estado === "sem_origem") { somar(r.semOrigem, sinal, valor); continue; }
    if (o.estado === "nao_identificada") { somar(r.naoIdentificada, sinal, valor); continue; }
    if (o.estado === "ambiguo") { somar(r.ambiguo, sinal, valor); continue; }
    for (const [nivel, ref] of [["campanha", o.campanha_ref], ["conjunto", o.conjunto_ref], ["anuncio", o.anuncio_ref]] as const) {
      if (!ref) continue;
      const m = r.porNivel[nivel]; const t = m.get(ref) ?? novo(); somar(t, sinal, valor); m.set(ref, t);
    }
  }
  return r;
}

// ---------- período
export type PeriodoId = "hoje" | "ontem" | "7d" | "30d" | "custom";
export const hojeBrasilia = (agora = Date.now()) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
export const somarDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Intervalo fechado [de, ate] em dias AAAA-MM-DD (Brasília). 7d/30d incluem hoje. */
export function intervalo(p: PeriodoId, hoje: string, custom?: { de: string; ate: string }): { de: string; ate: string } {
  if (p === "hoje") return { de: hoje, ate: hoje };
  if (p === "ontem") { const o = somarDias(hoje, -1); return { de: o, ate: o }; }
  if (p === "7d") return { de: somarDias(hoje, -6), ate: hoje };
  if (p === "30d") return { de: somarDias(hoje, -29), ate: hoje };
  const de = custom?.de || hoje, ate = custom?.ate || hoje;
  return de <= ate ? { de, ate } : { de: ate, ate: de };
}

// ---------- métricas e tabela
export interface InsightDia { ref: string; dia: string; gasto: number; impressoes: number; cliques: number; resultados?: number }
export interface Funil { visitas: number; comecaram: number; terminaram: number; leads: number; cliquesOferta: number; compraram: number }
export const funilZero = (): Funil => ({ visitas: 0, comecaram: 0, terminaram: 0, leads: 0, cliquesOferta: 0, compraram: 0 });
export interface LinhaTrafego {
  chave: string; nivel: Nivel | "sem_origem" | "nao_identificada" | "ambiguo" | "total"; ref: string; nome: string; pai?: string;
  status?: string | null; orcamento?: number | null;
  gasto: number; impressoes: number; cliques: number; vendas: number; faturamento: number; lucro: number;
  roas: number | null; custoPorVenda: number | null; leads: number; custoPorLead: number | null; cliquesOferta: number; custoPorCliqueOferta: number | null;
  funil: Funil;
}
const div = (a: number, b: number) => (b > 0 ? a / b : null);
export function completar(l: Omit<LinhaTrafego, "lucro" | "roas" | "custoPorVenda" | "custoPorLead" | "custoPorCliqueOferta" | "leads" | "cliquesOferta">): LinhaTrafego {
  return { ...l, leads: l.funil.leads, cliquesOferta: l.funil.cliquesOferta, lucro: l.faturamento - l.gasto, roas: div(l.faturamento, l.gasto), custoPorVenda: div(l.gasto, l.vendas), custoPorLead: div(l.gasto, l.funil.leads), custoPorCliqueOferta: div(l.gasto, l.funil.cliquesOferta) };
}

export interface EventoSimples { sessao: string; tipo: "visita" | "passo" | "fim" | "cta"; passo: number; criado_em: string; utm?: UtmBruta | null }
export interface LeadSimples { criada_em: string; utm?: UtmBruta | null }
const diaDe = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);

/** Funil por origem resolvida: sessões (pelo dia do primeiro evento), leads (pelo dia do lead) e compras (vendas líquidas do período). */
export function funilPorOrigem(eventos: EventoSimples[], leads: LeadSimples[], vendas: VendasAtribuidas, est: Estrutura, de: string, ate: string, minimoComecou = 1) {
  const acum: Record<Nivel, Map<string, Funil>> = { campanha: new Map(), conjunto: new Map(), anuncio: new Map() };
  const extra: Record<"sem_origem" | "nao_identificada" | "ambiguo", Funil> = { sem_origem: funilZero(), nao_identificada: funilZero(), ambiguo: funilZero() };
  const total = funilZero();
  const aplicar = (o: Origem, campo: keyof Funil, n = 1) => {
    total[campo] += n;
    if (o.estado === "sem_origem" || o.estado === "nao_identificada" || o.estado === "ambiguo") { extra[o.estado][campo] += n; return; }
    for (const [nivel, ref] of [["campanha", o.campanha_ref], ["conjunto", o.conjunto_ref], ["anuncio", o.anuncio_ref]] as const) {
      if (!ref) continue;
      const f = acum[nivel].get(ref) ?? funilZero(); f[campo] += n; acum[nivel].set(ref, f);
    }
  };
  const sess = new Map<string, { t: number; visita: boolean; utm: UtmBruta | null; max: number; fim: boolean; cta: boolean }>();
  for (const e of eventos) {
    const t = Date.parse(e.criado_em);
    const s = sess.get(e.sessao) ?? { t, visita: false, utm: null, max: 0, fim: false, cta: false };
    s.t = Math.min(s.t, t);
    if (e.tipo === "visita") { s.visita = true; s.utm = e.utm ?? s.utm; }
    if (e.tipo === "passo") s.max = Math.max(s.max, e.passo);
    if (e.tipo === "fim") s.fim = true;
    if (e.tipo === "cta") s.cta = true;
    sess.set(e.sessao, s);
  }
  for (const s of sess.values()) {
    if (!s.visita) continue;
    const dia = diaDe(new Date(s.t).toISOString());
    if (dia < de || dia > ate) continue;
    const o = resolverOrigem(s.utm, est);
    aplicar(o, "visitas");
    if (s.max >= minimoComecou) aplicar(o, "comecaram");
    if (s.fim) aplicar(o, "terminaram");
    if (s.cta) aplicar(o, "cliquesOferta");
  }
  for (const l of leads) { const dia = diaDe(l.criada_em); if (dia >= de && dia <= ate) aplicar(resolverOrigem(l.utm, est), "leads"); }
  // compraram = vendas líquidas (já com reembolso descontado)
  vendas.consideradas.forEach((v, i) => { aplicar(vendas.origens[i], "compraram", v.tipo === "reembolso" ? -1 : 1); });
  return { acum, extra, total };
}

export interface EntradaTabela {
  est: Estrutura & { statusDe?: Record<string, { status: string | null; orcamento: number | null }> };
  insights: Record<Nivel, InsightDia[]>;
  vendas: VendaTrafego[]; eventos: EventoSimples[]; leads: LeadSimples[];
  de: string; ate: string;
  /** Passo mínimo para valer "começou": 2 quando o quiz pula a abertura (a 1ª pergunta já registra passo 1 sozinha). */
  minimoComecou?: number;
}
export interface Tabela { linhas: LinhaTrafego[]; extras: LinhaTrafego[]; total: LinhaTrafego; atribuidas: VendasAtribuidas }

export function montarTabela(e: EntradaTabela): Tabela {
  const atrib = atribuirVendas(e.vendas, e.est, e.de, e.ate);
  const fun = funilPorOrigem(e.eventos, e.leads, atrib, e.est, e.de, e.ate, e.minimoComecou);
  const gastos: Record<Nivel, Map<string, { gasto: number; impressoes: number; cliques: number }>> = { campanha: new Map(), conjunto: new Map(), anuncio: new Map() };
  for (const nivel of ["campanha", "conjunto", "anuncio"] as const) {
    for (const i of e.insights[nivel] ?? []) {
      if (i.dia < e.de || i.dia > e.ate) continue;
      const t = gastos[nivel].get(i.ref) ?? { gasto: 0, impressoes: 0, cliques: 0 };
      t.gasto += +i.gasto || 0; t.impressoes += +i.impressoes || 0; t.cliques += +i.cliques || 0; gastos[nivel].set(i.ref, t);
    }
  }
  const mk = (nivel: Nivel, ref: string, nome: string, pai?: string): LinhaTrafego => {
    const g = gastos[nivel].get(ref); const v = atrib.porNivel[nivel].get(ref); const f = fun.acum[nivel].get(ref) ?? funilZero();
    const st = e.est.statusDe?.[`${nivel}:${ref}`];
    return completar({ chave: `${nivel}:${ref}`, nivel, ref, nome, pai, status: st?.status ?? null, orcamento: st?.orcamento ?? null, gasto: g?.gasto ?? 0, impressoes: g?.impressoes ?? 0, cliques: g?.cliques ?? 0, vendas: v?.vendas ?? 0, faturamento: v?.faturamento ?? 0, funil: f });
  };
  const linhas = [
    ...e.est.campanhas.map((c) => mk("campanha", c.ref, c.nome)),
    ...e.est.conjuntos.map((c) => mk("conjunto", c.ref, c.nome, c.campanha_ref)),
    ...e.est.anuncios.map((a) => mk("anuncio", a.ref, a.nome, a.conjunto_ref)),
  ];
  const gastoTotal = [...gastos.campanha.values()].reduce((s, x) => s + x.gasto, 0);
  const extra = (nivel: "sem_origem" | "nao_identificada" | "ambiguo", nome: string, v: Acumulo) =>
    completar({ chave: nivel, nivel, ref: nivel, nome, gasto: 0, impressoes: 0, cliques: 0, vendas: v.vendas, faturamento: v.faturamento, funil: fun.extra[nivel] });
  const extras = [
    extra("sem_origem", "Sem origem (venda sem UTM)", atrib.semOrigem),
    extra("ambiguo", "Ambíguo (mesmo nome em mais de um anúncio)", atrib.ambiguo),
    extra("nao_identificada", "UTM que não bate com nenhum anúncio", atrib.naoIdentificada),
  ].filter((x) => x.vendas || x.faturamento || x.funil.visitas || x.funil.leads || x.funil.cliquesOferta);
  const impr = [...gastos.campanha.values()].reduce((s, x) => s + x.impressoes, 0), cli = [...gastos.campanha.values()].reduce((s, x) => s + x.cliques, 0);
  const total = completar({ chave: "total", nivel: "total", ref: "total", nome: "Total", gasto: gastoTotal, impressoes: impr, cliques: cli, vendas: atrib.total.vendas, faturamento: atrib.total.faturamento, funil: fun.total });
  return { linhas, extras, total, atribuidas: atrib };
}

export type CampoOrdem = "nome" | "gasto" | "vendas" | "faturamento" | "lucro" | "roas" | "custoPorVenda" | "leads" | "custoPorLead" | "cliquesOferta" | "custoPorCliqueOferta";
/** Ordena (nulos sempre no fim, qualquer direção). */
export function ordenar<T extends LinhaTrafego>(linhas: T[], campo: CampoOrdem, desc: boolean): T[] {
  return [...linhas].sort((a, b) => {
    if (campo === "nome") return desc ? b.nome.localeCompare(a.nome, "pt-BR") : a.nome.localeCompare(b.nome, "pt-BR");
    const x = a[campo], y = b[campo];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return desc ? y - x : x - y;
  });
}

// ---------- funil por anúncio
export const ETAPAS: { campo: keyof Funil; rotulo: string }[] = [
  { campo: "visitas", rotulo: "Visitas" }, { campo: "comecaram", rotulo: "Começaram" }, { campo: "terminaram", rotulo: "Terminaram" },
  { campo: "leads", rotulo: "Leads" }, { campo: "cliquesOferta", rotulo: "Clicaram na oferta" }, { campo: "compraram", rotulo: "Compraram" },
];
export interface EtapaFunil { campo: keyof Funil; rotulo: string; n: number; taxa: number | null; custo: number | null }
export function etapasDoFunil(f: Funil, gasto: number): EtapaFunil[] {
  return ETAPAS.map((e, i) => {
    const n = f[e.campo];
    const ant = i ? f[ETAPAS[i - 1].campo] : 0;
    return { ...e, n, taxa: i && ant > 0 ? n / ant : null, custo: div(gasto, n) };
  });
}
/** A pior queda entre etapas de um anúncio (só com volume mínimo na etapa anterior, para 1 visita não virar "queda de 100%"). */
export function piorQueda(f: Funil, minimo = 10): { de: string; para: string; perda: number } | null {
  let pior: { de: string; para: string; perda: number } | null = null;
  for (let i = 1; i < ETAPAS.length; i++) {
    const ant = f[ETAPAS[i - 1].campo], atual = f[ETAPAS[i].campo];
    if (ant < minimo) continue;
    const perda = Math.min(1, Math.max(0, 1 - atual / ant));
    if (!pior || perda > pior.perda) pior = { de: ETAPAS[i - 1].rotulo, para: ETAPAS[i].rotulo, perda };
  }
  return pior;
}
/** Entre os anúncios, o que tem a pior queda (com volume). */
export function anuncioComPiorQueda(linhas: LinhaTrafego[], minimo = 10): { linha: LinhaTrafego; queda: { de: string; para: string; perda: number } } | null {
  let r: { linha: LinhaTrafego; queda: { de: string; para: string; perda: number } } | null = null;
  for (const l of linhas) {
    if (l.nivel !== "anuncio") continue;
    const q = piorQueda(l.funil, minimo);
    if (q && (!r || q.perda > r.queda.perda)) r = { linha: l, queda: q };
  }
  return r;
}

// ---------- gerador de UTM
export const UTM_COM_IDS = "utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}";
/** A URL final do anúncio: endereço do quiz + parâmetros (as chaves {{…}} ficam como estão: a Meta troca na hora do clique). */
export function urlComParametros(base: string, parametros: string): string {
  const b = base.trim().replace(/[?&]+$/, "");
  if (!b) return "";
  return `${b}${b.includes("?") ? "&" : "?"}${parametros.replace(/^[?&]+/, "")}`;
}
export const parametrosSemId = (campanha: string) => `utm_source=instagram&utm_medium=anuncio&utm_campaign=${encodeURIComponent(campanha)}&utm_content={{ad.name}}&utm_term={{adset.name}}`;
