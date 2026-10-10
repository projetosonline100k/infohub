// Lógica pura da guia "WhatsApp" do Jarvis — o painel de respostas aos
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
export interface Historico {
  config: { meta_resposta_horas_uteis: number; horario_util: [number, number]; silencio_alerta_dias: number; silencio_critico_dias: number };
  atualizado_em?: string;
  mentorados: Mentorado[];
  avaliacoes: Avaliacao[];
  promessas: Promessa[];
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
