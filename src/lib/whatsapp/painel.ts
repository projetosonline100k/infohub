// Lógica pura da guia "WhatsApp" do Atlas — o painel de respostas aos
// mentorados que a rotina do Claude monta lendo o WhatsApp
// (.claude/painel/build.py + historico.json, publicados por
// scripts/publicar-painel-whatsapp.py). Port de .claude/painel/metricas.html.

export interface CardWhatsapp {
  id: string;
  nome: string;
  when: string;
  tag: string;
  tagc: "urg" | "alta" | "media" | "ok" | string;
  disc: { letra: "D" | "I" | "S" | "C" | string; nome: string; evidencia: string; dica: string };
  ctx: string[];
  q: string;
  opcoes: { titulo: string; sanduiche: string; texto: string }[];
  nota: string;
  dif: number;
  tempo: number;
  // Checklist: a resposta em partes, na ordem de envio (id "<cardId>:<n>").
  // `opcoes` continua sendo a versão "tudo numa mensagem só".
  itens?: ItemResposta[];
}

export interface ItemResposta { id: string; titulo: string; texto: string; tempo: number; opcional?: boolean }

type Respondidos = Record<string, boolean>;
const obrigatorios = (c: CardWhatsapp) => (c.itens || []).filter((i) => !i.opcional);

// Card respondido: marcado inteiro, ou todos os itens obrigatórios marcados.
export function cardRespondido(c: CardWhatsapp, r: Respondidos): boolean {
  if (r[c.id]) return true;
  const req = obrigatorios(c);
  return req.length > 0 && req.every((i) => r[i.id]);
}

// "3/7": itens obrigatórios marcados / total obrigatórios.
export function progressoCard(c: CardWhatsapp, r: Respondidos): { feitos: number; total: number } {
  const req = obrigatorios(c);
  const tudo = !!r[c.id];
  return { feitos: req.filter((i) => tudo || r[i.id]).length, total: req.length };
}

// Minutos que ainda faltam neste card (só os itens obrigatórios não marcados).
export function minutosRestantes(c: CardWhatsapp, r: Respondidos): number {
  if (cardRespondido(c, r)) return 0;
  return c.itens?.length ? obrigatorios(c).filter((i) => !r[i.id]).reduce((t, i) => t + (i.tempo || 0), 0) : c.tempo || 0;
}

// Marcar o card inteiro marca (ou desmarca) todos os itens junto.
export function marcarCard(c: CardWhatsapp, feito: boolean, r: Respondidos): Respondidos {
  const novo = { ...r, [c.id]: feito };
  for (const i of c.itens || []) novo[i.id] = feito;
  return novo;
}

// Desmarcar um item tira também a marca do card inteiro.
export function marcarItem(c: CardWhatsapp, itemId: string, feito: boolean, r: Respondidos): Respondidos {
  const novo = { ...r, [itemId]: feito };
  if (!feito) novo[c.id] = false;
  return novo;
}

export interface Interacao { recebida: string; respondida: string | null; resumo?: string }
export interface Mentorado {
  id: string;
  card?: string | null;
  nome: string;
  grupo: string;
  disc: string;
  ultima_msg_mentorado: string | null;
  ultima_msg_davi?: string | null;
  interacoes: Interacao[];
  satisfacao: { data: string; nivel: number; evidencia: string }[];
  upgrade: { nivel: string; sinais: string[] };
}
export interface Avaliacao {
  mentorado: string; data: string; resumo: string;
  acolheu: boolean; solucao: boolean; proximos: boolean; junto: boolean; disc_ok: boolean;
  reacao?: string; obs?: string;
}
export interface Promessa { mentorado: string; o_que: string; desde: string; prazo: string | null; status: string }
/** O que o mentorado ficou de entregar ao Davi (19/10/2026, Davi: "nunca é o especialista que deve cobrar
 *  a gente, eu é quem devo cobrar"). status: "aguardando" | "entregue". cobrado_em: última cobrança. */
export interface Entrega { mentorado: string; o_que: string; desde: string; prazo: string | null; status: string; cobrado_em?: string | null; entregue_em?: string | null }
export const DIAS_PARA_COBRAR = 3;   // sem prazo: cobra depois de 3 dias (contando da última cobrança)

/** "cobrar" quando venceu o prazo, ou, sem prazo, passaram 3 dias desde o combinado/última cobrança. */
export function situacaoEntrega(e: Entrega, agora: Date): "entregue" | "cobrar" | "aguardando" {
  if (e.status === "entregue") return "entregue";
  const base = e.cobrado_em && e.cobrado_em > (e.prazo ?? "") ? e.cobrado_em : null;
  if (base) return agora.getTime() - new Date(base).getTime() >= DIAS_PARA_COBRAR * 86_400_000 ? "cobrar" : "aguardando";
  if (e.prazo) return new Date(e.prazo.length === 10 ? `${e.prazo}T23:59` : e.prazo) < agora ? "cobrar" : "aguardando";
  return agora.getTime() - new Date(e.desde).getTime() >= DIAS_PARA_COBRAR * 86_400_000 ? "cobrar" : "aguardando";
}
export interface Historico {
  config: { meta_resposta_horas_uteis: number; horario_util: [number, number]; silencio_alerta_dias: number; silencio_critico_dias: number };
  atualizado_em?: string;
  mentorados: Mentorado[];
  avaliacoes: Avaliacao[];
  promessas: Promessa[];
  entregas?: Entrega[];
  agenda: { data: string | null; o_que: string; mentorado?: string }[];
}

export const DIFICULDADE: Record<number, string> = { 1: "Fácil", 2: "Fácil", 3: "Média", 4: "Difícil", 5: "Difícil" };
export const EMOJI_SATISFACAO: Record<number, string> = { 1: "😟", 2: "😐", 3: "😊" };
export const UPGRADE: Record<string, [string, string]> = {
  alto: ["Alto", "ok"], medio: ["Médio", "media"], aberto: ["Em aberto", "alta"], baixo: ["Baixo", "urg"], sem_sinais: ["Sem sinais", "cinza"],
};

// Minutos dentro do horário útil (seg a sex, h0–h1) entre a e b.
export function minutosUteis(a: Date, b: Date, [h0, h1]: [number, number]): number {
  let m = 0;
  let t = new Date(a);
  for (let guarda = 0; t < b && guarda < 2000; guarda++) {
    const d = t.getDay();
    const h = t.getHours() + t.getMinutes() / 60;
    if (d > 0 && d < 6 && h >= h0 && h < h1) {
      const fim = new Date(t);
      fim.setHours(h1, 0, 0, 0);
      const e = fim < b ? fim : b;
      m += (e.getTime() - t.getTime()) / 60000;
      t = new Date(e);
    } else {
      const n = new Date(t);
      if (h >= h1 || d === 0 || d === 6) n.setDate(n.getDate() + 1);
      n.setHours(h0, 0, 0, 0);
      t = n;
    }
  }
  return m;
}

export function formatarMinutos(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "—";
  const r = Math.round(min);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60);
  const resto = r % 60;
  return `${h}h${resto ? String(resto).padStart(2, "0") : ""}`;
}

export const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
export function mediana(v: number[]) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

export const diasDesde = (iso: string | null | undefined, agora: Date) =>
  iso ? Math.floor((agora.getTime() - new Date(iso).getTime()) / 86400000) : null;

export const dataCurta = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00` : iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    : "a definir";

const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface Espera { mentorado: Mentorado; interacao: Interacao; min: number }

// Tudo o que as abas usam, calculado de uma vez a partir do histórico.
export function calcularMetricas(h: Historico, agora: Date) {
  const c = h.config;
  const meta = c.meta_resposta_horas_uteis * 60;
  const cor = (min: number) => (min <= meta ? "ok" : min <= meta * 2 ? "alta" : "urg");
  const respondidas: Espera[] = [];
  const pendentes: Espera[] = [];
  for (const m of h.mentorados) {
    for (const i of m.interacoes) {
      if (i.respondida) respondidas.push({ mentorado: m, interacao: i, min: minutosUteis(new Date(i.recebida), new Date(i.respondida), c.horario_util) });
      else pendentes.push({ mentorado: m, interacao: i, min: minutosUteis(new Date(i.recebida), agora, c.horario_util) });
    }
  }
  pendentes.sort((a, b) => b.min - a.min);

  // Maior espera por card (selo "esperando há X úteis").
  const esperaPorCard: Record<string, number> = {};
  for (const p of pendentes) {
    const id = p.mentorado.card;
    if (id && esperaPorCard[id] == null) esperaPorCard[id] = p.min;
  }

  const hoje = diaLocal(agora);
  const ritmo = [];
  for (let k = 6; k >= 0; k--) {
    const d = new Date(agora);
    d.setDate(d.getDate() - k);
    const chave = diaLocal(d);
    const recebidas = h.mentorados.flatMap((m) => m.interacoes).filter((i) => diaLocal(new Date(i.recebida)) === chave).length;
    const doDia = respondidas.filter((r) => diaLocal(new Date(r.interacao.respondida!)) === chave);
    ritmo.push({
      dia: chave,
      rotulo: k === 0 ? "hoje" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      recebidas,
      respondidas: doDia.length,
      tempoMedio: media(doDia.map((r) => r.min)),
    });
  }

  const tempos = respondidas.map((r) => r.min);
  const av = h.avaliacoes || [];
  const pct = (k: keyof Avaliacao) => (av.length ? Math.round((100 * av.filter((a) => a[k]).length) / av.length) : 0);
  const reacaoPositiva = av.length ? Math.round((100 * av.filter((a) => a.reacao === "positiva").length) / av.length) : 0;
  const porMentorado = h.mentorados
    .map((m) => ({ mentorado: m, tempos: respondidas.filter((r) => r.mentorado === m).map((r) => r.min) }))
    .filter((x) => x.tempos.length)
    .sort((a, b) => (media(b.tempos) ?? 0) - (media(a.tempos) ?? 0));

  const saude = h.mentorados
    .map((m) => {
      const ult = m.satisfacao[m.satisfacao.length - 1];
      const ant = m.satisfacao[m.satisfacao.length - 2];
      const silencio = diasDesde(m.ultima_msg_mentorado, agora);
      const risco = (ult?.nivel === 1 ? 3 : ult?.nivel === 2 ? 1 : 0)
        + (silencio != null && silencio >= c.silencio_critico_dias ? 3 : silencio != null && silencio >= c.silencio_alerta_dias ? 2 : 0);
      return { mentorado: m, ult, ant, silencio, risco, tempos: respondidas.filter((r) => r.mentorado === m).map((r) => r.min) };
    })
    .sort((a, b) => b.risco - a.risco);

  const promessaAtrasada = (p: Promessa) => p.status === "aberta" && !!p.prazo && new Date(`${p.prazo}T23:59`) < agora;
  const promessas = (h.promessas || []).filter((p) => p.status === "aberta").sort((a, b) => ((a.prazo || "9") < (b.prazo || "9") ? -1 : 1));
  const agenda = [...(h.agenda || [])].sort((a, b) => ((a.data || "9") < (b.data || "9") ? -1 : 1));
  const respondidasHoje = respondidas.filter((r) => diaLocal(new Date(r.interacao.respondida!)) === hoje).length;

  return {
    meta, cor, respondidas, pendentes, esperaPorCard, ritmo, hoje, tempos,
    dentroDaMeta: tempos.filter((t) => t <= meta).length,
    avaliacoes: av, pct, reacaoPositiva, porMentorado, saude,
    promessas, atrasadas: promessas.filter(promessaAtrasada), promessaAtrasada, agenda, respondidasHoje,
  };
}

// Os textos dos cards vêm com um pouco de HTML (<b>, <i>, <br>). Escapa tudo
// e devolve só essas marcações simples — o resto vira texto.
export function htmlSeguro(texto: string | null | undefined): string {
  const escapado = String(texto ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
  return escapado.replace(/&lt;(\/?)(b|strong|i|em|u)&gt;/g, "<$1$2>").replace(/&lt;br\s*\/?&gt;/g, "<br>");
}

// Texto da sugestão sem marcações, pronto pra colar no WhatsApp.
export function textoParaCopiar(texto: string): string {
  return texto.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

// ---------------------------------------------------------------- dados de uma conversa
// 19/10/2026 (Davi): "em vez de um negócio do lado, ao clicar no grupo do WhatsApp aparecem as
// informações daquele grupo ou pessoa, de forma organizada". O painel não guarda o chat_id: liga
// pelo nome do grupo (mentorado.grupo), pelo nome da pessoa e pelo telefone que aparece no card.
const simples = (t: string | null | undefined) =>
  (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const bate = (a: string, b: string) => !!a && !!b && (a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b)));

export interface ChatResumo { chat_id: string; chat_nome: string | null; eh_grupo: boolean }

/** Quão forte o nome bate: 3 igual, 2 mesmo primeiro nome, 1 um contém o outro, 0 nada. */
function forca(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 3;
  const pa = a.split(" ")[0], pb = b.split(" ")[0];
  if (pa.length >= 3 && pa === pb) return 2;
  return bate(a, b) ? 1 : 0;
}
/** Só os de ligação mais forte (ex.: "Carol" não puxa a Carolina se existe uma Carol). */
function melhores<T>(itens: T[], nota: (x: T) => number): T[] {
  const notas = itens.map(nota);
  const max = Math.max(0, ...notas);
  return max ? itens.filter((_, k) => notas[k] === max) : [];
}

export function daConversa(chat: ChatResumo, h: Historico | null, cards: CardWhatsapp[]): { mentorados: Mentorado[]; cards: CardWhatsapp[] } {
  const nome = simples(chat.chat_nome);
  const numero = chat.chat_id.split("@")[0].replace(/\D/g, "");
  // Grupo: pelo nome do grupo e, de desempate, pelo nome da pessoa dentro dele (dois mentorados
  // podem ter o mesmo grupo genérico, ex.: "Mentoria Core Experience Premium 90 reels").
  const mentorados = melhores(h?.mentorados ?? [], (m) => (chat.eh_grupo
    ? forca(simples(m.grupo), nome) + (bate(simples(m.nome), nome) ? 3 : 0)
    : forca(simples(m.nome), nome)));
  const ids = new Set(mentorados.map((m) => m.card).filter(Boolean));
  const peloTelefone = (c: CardWhatsapp) => {
    const numeros = (c.when.match(/\+?\d[\d\s().-]{8,}\d/g) || []).map((d) => d.replace(/\D/g, "")).filter((d) => d.length >= 10);
    return !chat.eh_grupo && numero.length >= 8 && numeros.some((n) => numero.endsWith(n.slice(-8)));
  };
  const ligados = cards.filter((c) => ids.has(c.id) || peloTelefone(c));
  if (ligados.length) return { mentorados, cards: ligados };
  // Sem ligação direta: pelo nome do card ("Pessoa · Grupo").
  return {
    mentorados,
    cards: melhores(cards, (c) => {
      const partes = c.nome.split(/[·|]/).map(simples).filter(Boolean);
      return chat.eh_grupo ? Math.max(forca(simples(c.nome), nome), ...partes.slice(1).map((p) => forca(p, nome))) : forca(partes[0] ?? "", nome);
    }),
  };
}

// ---------------------------------------------------------------- etiquetas da lista de conversas
// 19/10/2026 (Davi): "para identificar quem preciso responder, ao lado dos nomes etiquetas: Precisa
// responder, Compromissos, Mais de 24 horas sem resposta, Insatisfeito, Risco de churn…".
export interface Etiqueta { texto: string; tom: "urg" | "alta" | "media" | "ok"; dica: string }
type Metricas = ReturnType<typeof calcularMetricas>;

export function etiquetasDaConversa(chat: ChatResumo & { ultima_em?: string; ultima_de_mim?: boolean; ultima_texto?: string | null; ultima_tipo?: string }, h: Historico | null, cards: CardWhatsapp[],
  respondidos: Record<string, boolean>, m: Metricas | null, agora: Date): Etiqueta[] {
  const { mentorados, cards: cs } = daConversa(chat, h, cards);
  if (!mentorados.length && !cs.length) return [];
  const ids = new Set(mentorados.map((x) => x.id));
  const out: Etiqueta[] = [];
  // O painel é lido de tempos em tempos: se a última mensagem da conversa (ao vivo) é do Davi e veio
  // depois do que estava esperando, já foi respondido.
  const minhaDepois = (quando: string) => !!chat.ultima_de_mim && !!chat.ultima_em && new Date(chat.ultima_em) > new Date(quando);
  const esperando = (m?.pendentes ?? []).filter((p) => ids.has(p.mentorado.id) && !minhaDepois(p.interacao.recebida));
  const cardsAbertos = chat.ultima_de_mim ? [] : cs.filter((c) => !cardRespondido(c, respondidos));
  if (cardsAbertos.length || esperando.length) out.push({ texto: "Precisa responder", tom: "urg", dica: cardsAbertos[0]?.tag || "mensagem esperando resposta sua" });
  // A bola está com eles (19/10, Davi: "como eu deixei uma pergunta, deveria ter Aguardando resposta").
  if (chat.ultima_de_mim && chat.ultima_em && (chat.ultima_tipo === "audio" || (chat.ultima_texto ?? "").includes("?"))) {
    const h2 = (agora.getTime() - new Date(chat.ultima_em).getTime()) / 3_600_000;
    out.push(h2 >= 48
      ? { texto: `Sem resposta há ${Math.floor(h2 / 24)} dias`, tom: "alta", dica: "você perguntou e eles não responderam: retome a conversa" }
      : { texto: "Aguardando resposta", tom: "media", dica: "você perguntou; a bola está com eles" });
  }
  const horas = Math.max(0, ...esperando.map((p) => (agora.getTime() - new Date(p.interacao.recebida).getTime()) / 3_600_000));
  if (horas >= 24) out.push({ texto: "+24h sem resposta", tom: "urg", dica: `esperando há ${Math.floor(horas)}h` });
  const saude = (m?.saude ?? []).filter((s) => ids.has(s.mentorado.id));
  if (saude.some((s) => s.risco >= 3)) out.push({ texto: "Risco de churn", tom: "urg", dica: "insatisfeito ou em silêncio há muitos dias" });
  if (saude.some((s) => s.ult?.nivel === 1)) out.push({ texto: "Insatisfeito", tom: "alta", dica: saude.find((s) => s.ult?.nivel === 1)?.ult?.evidencia ?? "" });
  const promessas = (m?.promessas ?? []).filter((p) => ids.has(p.mentorado));
  const atrasadas = promessas.filter((p) => m?.promessaAtrasada(p));
  if (atrasadas.length) out.push({ texto: atrasadas.length > 1 ? `${atrasadas.length} compromissos atrasados` : "Compromisso atrasado", tom: "urg", dica: atrasadas.map((p) => p.o_que).join(" · ") });
  else if (promessas.length) out.push({ texto: promessas.length > 1 ? `${promessas.length} compromissos` : "Compromisso", tom: "media", dica: promessas.map((p) => p.o_que).join(" · ") });
  const deles = (h?.entregas ?? []).filter((e) => ids.has(e.mentorado) && situacaoEntrega(e, agora) !== "entregue");
  const cobrar = deles.filter((e) => situacaoEntrega(e, agora) === "cobrar");
  if (cobrar.length) out.push({ texto: cobrar.length > 1 ? `Cobrar ${cobrar.length} entregas` : "Cobrar entrega", tom: "urg", dica: cobrar.map((e) => e.o_que).join(" · ") });
  else if (deles.length) out.push({ texto: "Aguardando entrega deles", tom: "media", dica: deles.map((e) => e.o_que).join(" · ") });
  if (mentorados.some((x) => x.upgrade?.nivel === "alto")) out.push({ texto: "Upgrade", tom: "ok", dica: "potencial alto de upgrade" });
  return out;
}
