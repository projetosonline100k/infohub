// API de Conversões da Meta (18/11/2026): manda pelo servidor os mesmos eventos do pixel do navegador, com o mesmo event_id
// (a Meta junta os dois e conta uma vez só) e com e-mail/telefone/nome em hash SHA-256. Funciona mesmo com bloqueador de anúncios.
// Sem Deno nem rede aqui (só crypto), para dar para testar em tests/capi.test.mjs.
export const GRAPH = "https://graph.facebook.com/v21.0";

export type EventoCapi = "PageView" | "QuizPasso" | "Lead" | "CompleteRegistration" | "InitiateCheckout" | "Purchase";
export const EVENTOS_DO_QUIZ: EventoCapi[] = ["PageView", "QuizPasso", "Lead", "CompleteRegistration", "InitiateCheckout"];

export interface Contato { nome?: string | null; email?: string | null; whatsapp?: string | null }
export interface UsuarioCapi extends Contato { ip?: string | null; ua?: string | null; fbp?: string | null; fbc?: string | null; externo?: string | null }

export async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Regras da Meta: minúsculas, sem espaços nas pontas. */
export const normEmail = (e?: string | null) => { const v = (e ?? "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ""; };
/** Telefone só com dígitos e com o código do país (Brasil = 55) quando vier só DDD + número. */
export const normTelefone = (t?: string | null) => {
  let d = (t ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length >= 12 && d.length <= 13 ? d : "";
};
export const normNome = (n?: string | null) => semAcento((n ?? "").trim().toLowerCase()).replace(/[^a-z\s'-]/g, "").replace(/\s+/g, " ").trim();

export async function usuarioComHash(u: UsuarioCapi) {
  const out: Record<string, unknown> = {};
  const em = normEmail(u.email); if (em) out.em = [await sha256(em)];
  const ph = normTelefone(u.whatsapp); if (ph) out.ph = [await sha256(ph)];
  const partes = normNome(u.nome).split(/\s+/).filter(Boolean);
  if (partes[0]) out.fn = [await sha256(partes[0])];
  if (partes.length > 1) out.ln = [await sha256(partes[partes.length - 1])];
  if (u.externo) out.external_id = [await sha256(u.externo)];
  if (u.ip) out.client_ip_address = u.ip;
  if (u.ua) out.client_user_agent = u.ua;
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  return out;
}

export interface EntradaEvento {
  nome: EventoCapi; id: string; quando?: number; url?: string; origem?: "website" | "system_generated";
  usuario: UsuarioCapi; dados?: Record<string, unknown>;
}
export async function montarEvento(e: EntradaEvento) {
  const ev: Record<string, unknown> = {
    event_name: e.nome, event_time: e.quando ?? Math.floor(Date.now() / 1000), event_id: e.id,
    action_source: e.origem ?? "website", user_data: await usuarioComHash(e.usuario),
  };
  if (e.url) ev.event_source_url = e.url;
  if (e.dados && Object.keys(e.dados).length) ev.custom_data = e.dados;
  return ev;
}

/** `tokens` = segredo META_CAPI_TOKENS: JSON {"<id do pixel>":"<token de acesso>"}. */
export const tokenDoPixel = (tokens: string | undefined | null, pixel: string): string | null => {
  try { const t = (JSON.parse(tokens ?? "{}") as Record<string, unknown>)[pixel]; return typeof t === "string" && t.length > 20 ? t : null; } catch { return null; }
};

export async function enviarParaMeta(pixel: string, token: string, eventos: unknown[], testCode?: string | null) {
  const corpo: Record<string, unknown> = { data: eventos };
  if (testCode) corpo.test_event_code = testCode;
  const r = await fetch(`${GRAPH}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  // Nunca devolve nem registra o token; só o resumo.
  return { ok: r.ok, status: r.status, recebidos: j?.events_received ?? 0, erro: r.ok ? null : (j?.error?.message ?? "erro da Meta") as string };
}
