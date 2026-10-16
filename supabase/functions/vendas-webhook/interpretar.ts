// Lê o webhook da Kiwify ou da Hotmart (v2) e devolve o evento no formato do
// Infopro: venda ou reembolso, valor em reais e o dia (horário de Brasília).
// Sem Deno nem rede, para dar para testar em tests/vendasWebhook.test.mjs.

export type EventoVenda = {
  plataforma: "kiwify" | "hotmart";
  transacao_id: string;
  tipo: "venda" | "reembolso";
  valor: number;
  data: string; // yyyy-mm-dd
  produto_plataforma: string | null;
};

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const DIA = /^\d{4}-\d{2}-\d{2}/;

// Dia em Brasília (UTC-3, sem horário de verão).
export const diaBrasilia = (instante: Date) =>
  new Date(instante.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const diaDoTexto = (texto: unknown, agora: Date) =>
  typeof texto === "string" && DIA.test(texto) ? texto.slice(0, 10) : diaBrasilia(agora);

const numero = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function kiwify(corpo: Json, agora: Date): EventoVenda | null {
  const o = corpo.order ?? corpo;
  const id = o.order_id ?? o.id;
  if (!id) return null;
  const evento = String(o.webhook_event_type ?? "");
  const status = String(o.order_status ?? "");
  let tipo: EventoVenda["tipo"] | null = null;
  if (evento === "order_approved" || (!evento && status === "paid")) tipo = "venda";
  else if (["order_refunded", "chargeback"].includes(evento) || (!evento && ["refunded", "chargedback"].includes(status)))
    tipo = "reembolso";
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
      : diaDoTexto(o.refunded_at, agora),
    produto_plataforma: o.Product?.product_name ?? null,
  };
}

function hotmart(corpo: Json, agora: Date): EventoVenda | null {
  const evento = String(corpo.event ?? "");
  const tipo = evento === "PURCHASE_APPROVED"
    ? "venda"
    : ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK"].includes(evento) ? "reembolso" : null;
  const compra = corpo.data?.purchase ?? {};
  if (!tipo || !compra.transaction) return null;
  const aprovada = Number(compra.approved_date);
  return {
    plataforma: "hotmart",
    transacao_id: String(compra.transaction),
    tipo,
    valor: numero(compra.price?.value ?? compra.full_price?.value),
    data: tipo === "venda" && Number.isFinite(aprovada) && aprovada > 0
      ? diaBrasilia(new Date(aprovada))
      : diaBrasilia(agora),
    produto_plataforma: corpo.data?.product?.name ?? null,
  };
}

// null = evento que não mexe no faturamento (boleto gerado, carrinho abandonado…).
export function interpretarWebhook(corpo: Json, agora = new Date()): EventoVenda | null {
  if (!corpo || typeof corpo !== "object") return null;
  if (corpo.event && corpo.data) return hotmart(corpo, agora);
  return kiwify(corpo, agora);
}
