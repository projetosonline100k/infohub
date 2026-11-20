// Faturamento entrando sozinho. Migração 20261016004000_vendas_plataforma (+ 20261107010000: Eduzz e funil).
// A Kiwify, a Hotmart ou a Eduzz chamam POST /vendas-webhook?chave=<chave do produto>
// a cada evento de compra. A chave (produto_vendas_webhook) diz de qual
// produto é; a venda ou o reembolso vira uma linha em vendas_plataforma_eventos
// e o trigger soma no dia em produto_financeiro_diario. O reenvio da mesma
// transação é ignorado pela chave única. Sempre responde 200 para eventos que
// não interessam, para a plataforma não ficar tentando de novo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { interpretarWebhook } from "./interpretar.ts";
import { enviarParaMeta, montarEvento, tokenDoPixel } from "../_shared/capi.ts";

// Compra na Meta pela API de Conversões (18/11/2026): se quem comprou deixou o mesmo e-mail num quiz que tem pixel da Meta, a venda vira
// `Purchase` nesse pixel (com e-mail/telefone/nome em hash), e as campanhas passam a otimizar por venda. Nunca derruba o webhook.
// deno-lint-ignore no-explicit-any
async function comprarNaMeta(admin: any, e: { transacao_id: string; valor: number; comprador_email?: string; comprador_nome?: string; comprador_telefone?: string; utm_content?: string }) {
  const email = (e.comprador_email ?? "").trim().toLowerCase();
  if (!email) return;
  let { data: lead } = await admin.from("quiz_respostas").select("quiz_id, nome, whatsapp, email")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).order("criada_em", { ascending: false }).limit(1).maybeSingle();
  // 20/11: lead que deixou só o WhatsApp no quiz: acha pelo telefone (últimos 8 dígitos, como public.fone_chave).
  const fone = (e.comprador_telefone ?? "").replace(/\D/g, "");
  if (!lead && fone.length >= 8) {
    const { data: candidatos } = await admin.from("quiz_respostas").select("quiz_id, nome, whatsapp, email")
      .ilike("whatsapp", `%${fone.slice(-4)}%`).order("criada_em", { ascending: false }).limit(50);
    lead = (candidatos ?? []).find((l: { whatsapp: string | null }) => (l.whatsapp ?? "").replace(/\D/g, "").slice(-8) === fone.slice(-8)) ?? null;
  }
  if (!lead) return;
  const { data: q } = await admin.from("quizzes").select("pixels, variante_de, slug").eq("id", lead.quiz_id).maybeSingle();
  let pixels = q?.pixels;
  if (!pixels && q?.variante_de) pixels = (await admin.from("quizzes").select("pixels").eq("id", q.variante_de).maybeSingle()).data?.pixels;
  const pixel = pixels?.meta;
  const token = pixel ? tokenDoPixel(Deno.env.get("META_CAPI_TOKENS"), pixel) : null;
  if (!pixel || !token) return;
  const ev = await montarEvento({
    nome: "Purchase", id: `eduzz-${e.transacao_id}`, origem: "system_generated",
    usuario: { email: lead.email ?? email, nome: lead.nome ?? e.comprador_nome, whatsapp: lead.whatsapp },
    dados: { value: e.valor, currency: "BRL", content_name: "Instalivros" },
  });
  const r = await enviarParaMeta(pixel, token, [ev], Deno.env.get("META_CAPI_TEST_CODE"));
  if (!r.ok) console.error("vendas-webhook (Meta):", r.status, r.erro);
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, info: "webhook de vendas do Infopro" });

  const chave = new URL(req.url).searchParams.get("chave") ?? "";
  if (!/^[0-9a-f]{40,}$/.test(chave)) return json({ erro: "chave inválida" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: webhook } = await admin
    .from("produto_vendas_webhook").select("produto_id").eq("chave", chave).maybeSingle();
  if (!webhook) return json({ erro: "chave inválida" }, 401);

  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corpo: any;
  // JSON (Kiwify, Hotmart, Eduzz nova) ou formulário (postback antigo da Eduzz).
  const texto = await req.text();
  try {
    corpo = JSON.parse(texto);
  } catch {
    const campos = Object.fromEntries(new URLSearchParams(texto));
    if (!Object.keys(campos).length) return json({ erro: "corpo vazio" }, 400);
    corpo = campos;
  }

  const evento = interpretarWebhook(corpo);
  if (!evento) return json({ ok: true, ignorado: true });

  const { data: gravadas, error } = await admin.from("vendas_plataforma_eventos").upsert(
    { ...evento, produto_id: webhook.produto_id, payload: corpo },
    { onConflict: "plataforma,transacao_id,tipo", ignoreDuplicates: true },
  ).select("id");
  if (error) {
    console.error("vendas-webhook:", error.message);
    return json({ erro: "falha ao gravar" }, 500);
  }
  // Só a venda nova (reenvio da mesma transação não conta de novo na Meta).
  if (evento.tipo === "venda" && gravadas?.length) { try { await comprarNaMeta(admin, evento); } catch (e) { console.error("vendas-webhook (Meta):", e); } }
  return json({ ok: true, tipo: evento.tipo, valor: evento.valor, data: evento.data });
});
