// Shirley, a CS (pedido do Davi, 16/10/2026): "atue como um CS mesmo, que me
// cobre, veja se alguém pode ficar insatisfeito… sair de dentro do Atlas com
// alerta: Davi!! olha o WhatsApp!!". Regras puras (testadas em
// tests/shirley.test.mjs); o hook useShirley lê as conversas e mostra na orbe.

export interface ConversaResumo {
  chat_id: string; chat_nome: string | null; eh_grupo: boolean; ultima_em: string; ultima_de_mim: boolean;
  ultima_texto: string | null; ultima_autor: string | null;
}

export type MotivoAlerta = "insatisfeito" | "esperando";
export interface AlertaShirley {
  chatId: string; nome: string; motivo: MotivoAlerta; minutos: number; trecho: string; ultimaEm: string;
}

/** Sinais de cliente insatisfeito ou em risco (cancelar, reembolso, reclamação, sumiço de acesso…). */
const INSATISFEITO = new RegExp(
  [
    "reembols", "cancel", "estorn", "devolu[cç]", "chargeback", "procon", "reclame aqui",
    "insatisfeit", "decepcion", "frustrad", "arrependid", "p[ée]ssim", "horr[ií]vel", "absurd", "vergonha", "enganad", "golpe",
    "n[aã]o (est[aá] |t[aá] )?funciona", "n[aã]o consigo (acessar|entrar|abrir)", "sem acesso", "n[aã]o recebi",
    "ningu[ée]m (me )?respond", "sem resposta", "ainda n[aã]o (tive|recebi|me responderam)", "t[oô] esperando", "estou esperando",
    "quero meu dinheiro", "n[aã]o vale", "desist",
  ].join("|"),
  "i",
);

/** Grupo de cliente da Core ("Isabel · Core Audience 2.0", "Dra Helia - core Experience"): conta como cliente. */
export function ehGrupoDeCliente(nome: string | null | undefined): boolean {
  return !!nome && /\bcore\b/i.test(nome);
}
/** Nome do cliente no grupo: o pedaço antes de " · ", " | " ou " - " ("Isabel · Core Audience 2.0" → "Isabel"). */
export function clienteDoGrupo(nome: string): string {
  const p = nome.split(/\s+[·|]\s+|\s+-\s*/)[0].trim();
  return p && !/\bcore\b/i.test(p) ? p : nome;
}
const conta = (c: ConversaResumo) => !c.ultima_de_mim && (!c.eh_grupo || ehGrupoDeCliente(c.chat_nome));
const nomeDe = (c: ConversaResumo) => (c.eh_grupo && c.chat_nome ? clienteDoGrupo(c.chat_nome) : c.chat_nome || c.ultima_autor || "Cliente");

/** Só um "ok/agendado/obrigado/👍": a conversa acabou, não precisa responder (16/10: Ana Paula "Agendado"). */
export function ehSoConfirmacao(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim().toLowerCase().replace(/[!.,;:\s]+$/u, "");
  if (!t) return false;
  // Só emoji (👍, 🙏, ❤️…): tira emojis, o seletor de variação e o "junta-emoji"; se não sobrar nada, é confirmação.
  if (!t.replace(/\p{Extended_Pictographic}/gu, "").replace(/\u200d|\ufe0f|\s/g, "")) return true;
  return /^(ok(ay)?|ok obrigad[oa]|blz|beleza|show( de bola)?|top|perfeito|agendado|combinado|fechado|certo|certinho|obrigad[oa]( davi)?|muito obrigad[oa]|valeu|vlw|massa|am[eé]m|kk+|ha(ha)+|entendi|t[aá] bom|tudo certo|maravilha|[oó]timo|boa)$/.test(t);
}

export function pareceInsatisfeito(texto: string | null | undefined): boolean {
  return !!texto && INSATISFEITO.test(texto);
}

/** Horário em que a Shirley cobra (8h às 22h): de madrugada ninguém é cobrado. */
export function horarioDeCobrar(agora: Date): boolean {
  const h = agora.getHours();
  return h >= 8 && h < 22;
}

/**
 * O que merece alerta agora: conversa individual ou grupo de cliente da Core em que a última
 * mensagem é do cliente e (a) parece insatisfeito, ou (b) está esperando há
 * mais de `esperaMin` minutos. Mais urgente primeiro (insatisfeito, depois quem espera há mais tempo).
 * Conversa parada há mais de 3 dias fica de fora (já virou "sem resposta" antiga, é do painel).
 */
export function alertasDoWhatsapp(conversas: ConversaResumo[], agora: Date, esperaMin = 60): AlertaShirley[] {
  const lista: AlertaShirley[] = [];
  for (const c of conversas) {
    if (!conta(c)) continue;
    const minutos = Math.floor((agora.getTime() - new Date(c.ultima_em).getTime()) / 60_000);
    if (minutos < 0 || minutos > 3 * 24 * 60) continue;
    const trecho = (c.ultima_texto ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const nome = nomeDe(c);
    if (pareceInsatisfeito(c.ultima_texto)) lista.push({ chatId: c.chat_id, nome, motivo: "insatisfeito", minutos, trecho, ultimaEm: c.ultima_em });
    else if (minutos >= esperaMin && !ehSoConfirmacao(c.ultima_texto)) lista.push({ chatId: c.chat_id, nome, motivo: "esperando", minutos, trecho, ultimaEm: c.ultima_em });
  }
  return lista.sort((a, b) => (a.motivo === b.motivo ? b.minutos - a.minutos : a.motivo === "insatisfeito" ? -1 : 1));
}

/** Mensagens de clientes que acabaram de chegar (conversa individual, última é do cliente, há menos de `janelaMin`). */
export function chegaramAgora(conversas: ConversaResumo[], agora: Date, janelaMin = 20): AlertaShirley[] {
  return conversas.flatMap((c) => {
    if (!conta(c)) return [];
    const minutos = Math.floor((agora.getTime() - new Date(c.ultima_em).getTime()) / 60_000);
    if (minutos < 0 || minutos >= janelaMin) return [];
    return [{ chatId: c.chat_id, nome: nomeDe(c), motivo: pareceInsatisfeito(c.ultima_texto) ? "insatisfeito" as const : "esperando" as const,
      minutos, trecho: (c.ultima_texto ?? "").replace(/\s+/g, " ").trim().slice(0, 140), ultimaEm: c.ultima_em }];
  });
}

export function tempoEsperando(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${Math.floor(h / 24)} dia(s)`;
}

/**
 * Paciência da Shirley (16/10, Davi: "se eu ficar ignorando, a Shirley tem que ficar com raiva e me
 * obrigar a responder"). Sobe com cada "depois" e com o tempo de espera do cliente:
 * 0 calma · 1 impaciente · 2 brava · 3 furiosa (não deixa mais adiar).
 */
export type Humor = 0 | 1 | 2 | 3;
export function humorDaShirley(vezesAdiado: number, minutosEsperando: number, insatisfeito: boolean): Humor {
  let h = Math.min(3, vezesAdiado);
  if (minutosEsperando >= 8 * 60) h = Math.max(h, 3);
  else if (minutosEsperando >= 4 * 60) h = Math.max(h, 2);
  else if (minutosEsperando >= 2 * 60) h = Math.max(h, 1);
  if (insatisfeito) h = Math.max(h, 2);
  return h as Humor;
}
/** Quanto ela deixa adiar, por humor (furiosa: nada). */
export const ADIAR_MIN: Record<Humor, number> = { 0: 30, 1: 20, 2: 10, 3: 0 };

export function falaDaShirley(h: Humor, nome: string, tempo: string, insatisfeito: boolean): string {
  if (insatisfeito && h < 3) return h >= 2 ? `🚨 Davi!! ${nome} pode estar insatisfeito e você ainda não respondeu!` : "🚨 Davi!! Olha o WhatsApp!!";
  return [
    `📱 Davi, ${nome} está esperando`,
    `😤 Davi… ${nome} AINDA está esperando (${tempo})`,
    `😠 Davi, chega! ${nome} está há ${tempo} sem resposta`,
    `🤬 DAVI. Responde ${nome} AGORA. Já são ${tempo}.`,
  ][h];
}
