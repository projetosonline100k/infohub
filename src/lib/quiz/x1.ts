// X1 do quiz (12/11/2026, Davi: "abordar a pessoa com mensagens padrão ou feitas na hora, visual de WhatsApp, categorias na lateral").
// A parte de contas: modelos de mensagem, número do WhatsApp, em qual categoria cada lead cai. Sem React nem importações: testável.

export interface Abordagem { id: string; resposta_id: string; texto: string; modelo: string | null; enviada_em: string; de_mim?: boolean }
export interface LeadX1 { id: string; nome: string | null; whatsapp: string | null; perfil: string | null; status: "novo" | "em_contato" | "convertido"; criada_em: string }
export interface Modelo { id: string; nome: string; texto: string; proprio: boolean }

export const MODELOS_PADRAO: Modelo[] = [
  { id: "p-boas-vindas", nome: "Boas-vindas", proprio: false, texto: "Oi{ nome}! Vi que você fez o nosso quiz e caiu no perfil {perfil}. Posso te passar o que a gente preparou pra esse perfil?" },
  { id: "p-retomar", nome: "Retomar", proprio: false, texto: "Oi{ nome}, tudo bem? Passando pra saber se você viu minha mensagem sobre o seu resultado do quiz. Posso te ajudar com alguma dúvida?" },
  { id: "p-oferta", nome: "Oferta", proprio: false, texto: "{Nome}, separei uma condição pensada pro seu perfil ({perfil}). Quer que eu te explique como funciona?" },
  { id: "p-duvida", nome: "Tirar dúvida", proprio: false, texto: "Oi{ nome}! Ficou alguma dúvida sobre o seu resultado ou sobre como começar? É só me falar por aqui." },
  { id: "p-pos-compra", nome: "Pós-compra", proprio: false, texto: "Que bom ter você com a gente{, nome}! Qualquer dúvida no começo é só me chamar por aqui." },
];

export const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] ?? "";
const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * Troca as variáveis do modelo. {nome}, {perfil}, {Nome} (inicial maiúscula). O que vem grudado ("Oi{ nome}", "{, nome}")
 * só entra se houver nome: sem nome o "Oi!" não vira "Oi !".
 */
export function preencherModelo(texto: string, v: { nome?: string | null; perfil?: string | null }): string {
  const nome = capitalizar(primeiroNome(v.nome));
  const perfil = (v.perfil ?? "").trim();
  return texto
    .replace(/\{(\s*,?\s*)nome\}/g, (_t, pre: string) => (nome ? `${pre}${nome}` : ""))
    .replace(/\{Nome\}/g, nome || "Oi")
    .replace(/\{perfil\}/gi, perfil || "seu perfil")
    .replace(/[ \t]+([!?.,])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Número para o wa.me: só dígitos, com 55 na frente quando vem só com DDD. null se não parece um celular/telefone. */
export function telefoneWa(w: string | null | undefined): string | null {
  const d = (w ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}
export const linkWhatsapp = (w: string | null | undefined, texto: string) => {
  const n = telefoneWa(w);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
};

export type CategoriaX1 = "quentes" | "abordar" | "conversa" | "retomar" | "convertidos" | "sem_whatsapp";
/** O que se sabe da compra do lead (vem do painel: checkout e venda pelo e-mail). */
export interface EstadoX1 { clicouCheckout: boolean; comprou: boolean }
export const HORAS_PARA_RETOMAR = 24;

/**
 * Em que fila o lead está. Convertido ou quem já comprou sai das filas; sem WhatsApp válido não dá para abordar; quem clicou no checkout e NÃO
 * comprou é o mais quente (fila própria); sem mensagem enviada, é para abordar; depois, conversa ou retomar pelo tempo da última mensagem.
 */
export function categoriaDoLead(l: LeadX1, abordagens: Pick<Abordagem, "enviada_em">[], agora = Date.now(), estado?: EstadoX1): CategoriaX1 {
  if (l.status === "convertido" || estado?.comprou) return "convertidos";
  if (!telefoneWa(l.whatsapp)) return "sem_whatsapp";
  if (estado?.clicouCheckout) return "quentes";
  if (!abordagens.length) return "abordar";
  const ultima = Math.max(...abordagens.map((a) => Date.parse(a.enviada_em)));
  return agora - ultima >= HORAS_PARA_RETOMAR * 3_600_000 ? "retomar" : "conversa";
}

export function agruparPorLead(abordagens: Abordagem[]): Map<string, Abordagem[]> {
  const m = new Map<string, Abordagem[]>();
  for (const a of [...abordagens].sort((x, y) => Date.parse(x.enviada_em) - Date.parse(y.enviada_em))) {
    m.set(a.resposta_id, [...(m.get(a.resposta_id) ?? []), a]);
  }
  return m;
}

export function contarCategorias(leads: LeadX1[], porLead: Map<string, Abordagem[]>, agora = Date.now(), estados?: Map<string, EstadoX1>): Record<CategoriaX1 | "todos", number> {
  const c: Record<CategoriaX1 | "todos", number> = { quentes: 0, abordar: 0, conversa: 0, retomar: 0, convertidos: 0, sem_whatsapp: 0, todos: leads.length };
  for (const l of leads) c[categoriaDoLead(l, porLead.get(l.id) ?? [], agora, estados?.get(l.id))]++;
  return c;
}

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(iso: string, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - Date.parse(iso)) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Mensagem escrita para um lead → modelo reaproveitável: o nome dele vira {nome} e o perfil vira {perfil}. */
export function generalizarModelo(texto: string, v: { nome?: string | null; perfil?: string | null }): string {
  let t = texto;
  const n = primeiroNome(v.nome);
  if (n.length >= 2) t = t.replace(new RegExp(`(^|[^\\p{L}])${esc(n)}(?![\\p{L}])`, "giu"), (_m, antes: string) => `${antes}{nome}`);
  const p = (v.perfil ?? "").trim();
  if (p.length >= 3) t = t.replace(new RegExp(esc(p), "gi"), "{perfil}");
  return t;
}
