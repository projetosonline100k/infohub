// Lê o webhook da Kiwify, da Hotmart (v2) ou da Eduzz e devolve o evento no formato do Infopro: o tipo
// (venda, reembolso ou um passo do funil: pendente = Pix/boleto gerado, recusada, cancelada, abandono),
// o valor em reais, o dia (horário de Brasília) e, quando vierem, a origem (UTMs), o comprador e o meio
// de pagamento. Só venda e reembolso mexem no faturamento (trigger vendas_plataforma_somar).
// Sem Deno nem rede, para dar para testar em tests/vendasWebhook.test.mjs.

export type TipoEvento = "venda" | "reembolso" | "pendente" | "recusada" | "cancelada" | "abandono";
export type EventoVenda = {
  plataforma: "kiwify" | "hotmart" | "eduzz";
  transacao_id: string;
  tipo: TipoEvento;
  valor: number;
  data: string; // yyyy-mm-dd
  produto_plataforma: string | null;
  // Opcionais (só aparecem quando a plataforma manda):
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  comprador_nome?: string;
  comprador_email?: string;
  metodo_pagamento?: string;
};

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const DIA = /^\d{4}-\d{2}-\d{2}/;

// Dia em Brasília (UTC-3, sem horário de verão).
export const diaBrasilia = (instante: Date) =>
  new Date(instante.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const diaDoTexto = (texto: unknown, agora: Date) => {
  if (typeof texto === "string" && DIA.test(texto)) return texto.slice(0, 10);
  if (typeof texto === "string" && /^\d{2}\/\d{2}\/\d{4}/.test(texto)) return `${texto.slice(6, 10)}-${texto.slice(3, 5)}-${texto.slice(0, 2)}`;
  return diaBrasilia(agora);
};

const numero = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Primeiro valor de texto/número cuja chave bate com `chave`, procurando em qualquer profundidade. */
function achar(obj: Json, chave: RegExp, profundidade = 0): string | undefined {
  if (!obj || typeof obj !== "object" || profundidade > 6) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (chave.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v).trim();
  }
  for (const v of Object.values(obj)) {
    const r = achar(v, chave, profundidade + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** Origem, comprador e pagamento: os nomes mudam de plataforma para plataforma, então procura por padrão. */
function extras(corpo: Json): Partial<EventoVenda> {
  const e: Partial<EventoVenda> = {
    utm_source: achar(corpo, /^utm_?source$|^src$/i),
    utm_medium: achar(corpo, /^utm_?medium$/i),
    utm_campaign: achar(corpo, /^utm_?campaign$|^sck$/i),
    utm_content: achar(corpo, /^utm_?content$/i),
    utm_term: achar(corpo, /^utm_?term$/i),
    comprador_email: achar(corpo, /^(cus_|customer_|buyer_)?email$/i),
    comprador_nome: achar(corpo, /^(cus_|customer_|buyer_)?(full_?)?name$|^nome$/i),
    metodo_pagamento: achar(corpo, /^payment_?(method|type)$|^paymentMethod$|^trans_paymentmethod$|^forma_?pagamento$/i),
  };
  // O nome do comprador pode bater com o nome do produto: só vale se estiver junto de um e-mail de comprador.
  if (!e.comprador_email) delete e.comprador_nome;
  for (const k of Object.keys(e) as (keyof EventoVenda)[]) if (e[k] === undefined) delete e[k];
  return e;
}

function kiwify(corpo: Json, agora: Date): EventoVenda | null {
  const o = corpo.order ?? corpo;
  const id = o.order_id ?? o.id;
  if (!id) return null;
  const evento = String(o.webhook_event_type ?? "");
  const status = String(o.order_status ?? "");
  let tipo: TipoEvento | null = null;
  if (evento === "order_approved" || (!evento && status === "paid")) tipo = "venda";
  else if (["order_refunded", "chargeback"].includes(evento) || (!evento && ["refunded", "chargedback"].includes(status)))
    tipo = "reembolso";
  else if (["billet_created", "pix_created"].includes(evento) || (!evento && status === "waiting_payment")) tipo = "pendente";
  else if (evento === "order_rejected" || (!evento && status === "refused")) tipo = "recusada";
  if (!tipo) return null;
  const c = o.Commissions ?? {};
  // A Kiwify manda em centavos.
  const valor = numero(c.charge_amount ?? c.product_base_price) / 100;
  return {
    plataforma: "kiwify",
    transacao_id: String(id),
    tipo,
    valor,
    data: tipo === "venda"
      ? diaDoTexto(o.approved_date ?? o.created_at, agora)
      : tipo === "reembolso" ? diaDoTexto(o.refunded_at, agora) : diaDoTexto(o.created_at, agora),
    produto_plataforma: o.Product?.product_name ?? null,
    ...extras(o),
  };
}

const HOTMART: Record<string, TipoEvento> = {
  PURCHASE_APPROVED: "venda", PURCHASE_COMPLETE: "venda",
  PURCHASE_REFUNDED: "reembolso", PURCHASE_CHARGEBACK: "reembolso",
  PURCHASE_BILLET_PRINTED: "pendente", PURCHASE_DELAYED: "pendente",
  PURCHASE_CANCELED: "cancelada", PURCHASE_EXPIRED: "cancelada",
  PURCHASE_OUT_OF_SHOPPING_CART: "abandono",
};

function hotmart(corpo: Json, agora: Date): EventoVenda | null {
  const evento = String(corpo.event ?? "");
  const tipo = HOTMART[evento] ?? null;
  const compra = corpo.data?.purchase ?? {};
  const id = compra.transaction ?? (tipo === "abandono" ? `${corpo.data?.buyer?.email ?? ""}:${corpo.creation_date ?? ""}` : null);
  if (!tipo || !id || (tipo === "venda" && evento === "PURCHASE_COMPLETE")) return null;   // COMPLETE vem depois do APPROVED
  const aprovada = Number(compra.approved_date);
  return {
    plataforma: "hotmart",
    transacao_id: String(id),
    tipo,
    valor: numero(compra.price?.value ?? compra.full_price?.value),
    data: tipo === "venda" && Number.isFinite(aprovada) && aprovada > 0
      ? diaBrasilia(new Date(aprovada))
      : diaBrasilia(agora),
    produto_plataforma: corpo.data?.product?.name ?? null,
    ...extras(corpo.data ?? {}),
  };
}

// Eduzz: o webhook novo (MyEduzz, JSON) e o postback antigo (campos trans_*). Lê por padrão, porque o formato
// exato varia; o aviso inteiro fica salvo em `payload` para conferir/ajustar depois.
const EDUZZ_STATUS: Record<string, TipoEvento> = {   // trans_status do postback antigo
  "1": "pendente", "3": "venda", "4": "cancelada", "6": "pendente", "7": "reembolso", "10": "cancelada", "11": "pendente", "15": "pendente",
};
function tipoPorTexto(t: string): TipoEvento | null {
  const s = t.toLowerCase();
  if (/abandon/.test(s)) return "abandono";
  if (/refund|reembols|chargeback|estorn/.test(s)) return "reembolso";
  if (/refus|recus|declin|denied|negad/.test(s)) return "recusada";
  if (/cancel|expir/.test(s)) return "cancelada";
  if (/waiting|open|aguard|pending|created|recover|billet|boleto|pix_?generated|aberta/.test(s)) return "pendente";
  if (/paid|paga|approved|aprovad|complete/.test(s)) return "venda";
  return null;
}
export const ehEduzz = (corpo: Json) =>
  !!corpo && typeof corpo === "object" && (
    /eduzz|^(myeduzz|sun)\./i.test(String(corpo.event ?? corpo.type ?? "")) || "trans_cod" in corpo || "edz_fat_cod" in corpo
    || (!/^PURCHASE_/.test(String(corpo.event ?? "")) && corpo.data && typeof corpo.data === "object" && ("buyer" in corpo.data || "invoice" in corpo.data || "items" in corpo.data) && !corpo.data.purchase)
  );

function eduzz(corpo: Json, agora: Date): EventoVenda | null {
  const d = corpo.data && typeof corpo.data === "object" ? corpo.data : corpo;
  const evento = String(corpo.event ?? corpo.type ?? "");
  const legado = corpo.trans_status != null ? EDUZZ_STATUS[String(corpo.trans_status)] : undefined;
  const tipo = legado ?? tipoPorTexto(evento) ?? tipoPorTexto(String(d.status ?? d.invoice?.status ?? ""));
  const id = d.id ?? d.invoiceId ?? d.invoice_id ?? d.invoice?.id ?? d.transactionId ?? corpo.trans_cod ?? corpo.edz_fat_cod
    ?? (tipo === "abandono" ? `${achar(d, /email$/i) ?? ""}:${corpo.sentDate ?? corpo.createdAt ?? agora.toISOString()}` : null);
  if (!tipo || !id) return null;
  const valor = numero(d.price?.paid?.value ?? d.paid?.value ?? d.price?.value ?? d.total?.value ?? d.value ?? d.amount ?? d.invoice?.value
    ?? corpo.trans_paid ?? corpo.trans_value ?? achar(d, /^(paid|total|price|value|amount)$/i));
  const quando = d.paidAt ?? d.paid_at ?? d.paymentDate ?? d.createdAt ?? d.created_at ?? corpo.trans_paiddate ?? corpo.trans_createdate ?? corpo.sentDate;
  const produto = d.items?.[0]?.name ?? d.items?.[0]?.product?.name ?? d.product?.name ?? corpo.product_name ?? null;
  return {
    plataforma: "eduzz",
    transacao_id: String(id),
    tipo,
    valor,
    data: tipo === "venda" ? diaDoTexto(quando, agora) : diaBrasilia(agora),
    produto_plataforma: produto ? String(produto) : null,
    ...utmAgrupada(d.utm ?? d.utms ?? d.tracker ?? d.tracking ?? corpo.utm),
    ...extras(corpo),
    // Comprador: o "buyer" da fatura (ou o "customer" do carrinho), não o aluno nem o produtor.
    ...(d.buyer?.email || d.customer?.email ? {
      comprador_email: String(d.buyer?.email ?? d.customer?.email),
      ...(d.buyer?.name || d.customer?.name ? { comprador_nome: String(d.buyer?.name ?? d.customer?.name) } : {}),
    } : {}),
  };
}

/** UTMs num objeto só ({ source, medium, campaign, ... }). */
function utmAgrupada(u: Json): Partial<EventoVenda> {
  if (!u || typeof u !== "object") return {};
  const e: Partial<EventoVenda> = {};
  for (const k of ["source", "medium", "campaign", "content", "term"] as const) {
    const v = u[k] ?? u[`utm_${k}`] ?? u[`utm${k[0].toUpperCase()}${k.slice(1)}`];
    if (typeof v === "string" && v.trim()) e[`utm_${k}`] = v.trim();
  }
  return e;
}

// null = evento que não interessa (protesto, assinatura atrasada…).
export function interpretarWebhook(corpo: Json, agora = new Date()): EventoVenda | null {
  if (!corpo || typeof corpo !== "object") return null;
  if (ehEduzz(corpo)) return eduzz(corpo, agora);
  if (corpo.event && corpo.data) return hotmart(corpo, agora);
  return kiwify(corpo, agora);
}
