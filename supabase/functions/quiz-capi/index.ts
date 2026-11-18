// Eventos do quiz pela API de Conversões da Meta (18/11/2026). O navegador chama aqui com o mesmo event_id que mandou ao pixel;
// a função descobre o pixel do quiz no banco (nunca confia no cliente), junta IP/navegador da própria requisição e envia à Meta.
// Segredos: META_CAPI_TOKENS ({"<pixel>":"<token>"}, ver scripts/capi-definir-token.sh) e, opcional, META_CAPI_TEST_CODE (aba Testar eventos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EVENTOS_DO_QUIZ, enviarParaMeta, montarEvento, tokenDoPixel, type EventoCapi } from "../_shared/capi.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = JSON.parse((await req.text()).slice(0, 8000)); } catch { return json({ erro: "corpo inválido" }, 400); }
  const slug = txt(b.slug, 80).toLowerCase(), nome = txt(b.evento, 40) as EventoCapi, id = txt(b.event_id, 64);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !EVENTOS_DO_QUIZ.includes(nome) || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return json({ erro: "dados inválidos" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: pix } = await admin.rpc("quiz_publico", { p_slug: slug });
  const pixel = (pix as { pixels?: { meta?: string } } | null)?.pixels?.meta;
  if (!pixel || !/^\d{8,20}$/.test(pixel)) return json({ ok: true, ignorado: "quiz sem pixel da Meta" });
  const token = tokenDoPixel(Deno.env.get("META_CAPI_TOKENS"), pixel);
  if (!token) return json({ ok: true, ignorado: "sem token da API de Conversões para este pixel" });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const c = b.contato ?? {};
  const url = txt(b.url, 500);
  const dados: Record<string, unknown> = {};
  if (nome === "QuizPasso" && Number.isFinite(Number(b.passo))) dados.passo = Number(b.passo);
  if (nome === "InitiateCheckout") dados.content_name = "Instalivros";
  const sessao = UUID.test(txt(b.sessao, 40)) ? txt(b.sessao, 40) : null;
  const ev = await montarEvento({
    nome, id, url: /^https:\/\//.test(url) ? url : undefined, dados,
    usuario: { nome: txt(c.nome, 120), email: txt(c.email, 160), whatsapp: txt(c.whatsapp, 30), ip, ua: req.headers.get("user-agent"), fbp: txt(b.fbp, 120) || null, fbc: txt(b.fbc, 200) || null, externo: sessao },
  });
  const r = await enviarParaMeta(pixel, token, [ev], Deno.env.get("META_CAPI_TEST_CODE"));
  if (!r.ok) console.error("quiz-capi:", r.status, r.erro);
  return json({ ok: r.ok, recebidos: r.recebidos, erro: r.erro });
});
