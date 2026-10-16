// Faturamento entrando sozinho. Migração 20261016004000_vendas_plataforma.
// A Kiwify ou a Hotmart chamam POST /vendas-webhook?chave=<chave do produto>
// a cada evento de compra. A chave (produto_vendas_webhook) diz de qual
// produto é; a venda ou o reembolso vira uma linha em vendas_plataforma_eventos
// e o trigger soma no dia em produto_financeiro_diario. O reenvio da mesma
// transação é ignorado pela chave única. Sempre responde 200 para eventos que
// não interessam, para a plataforma não ficar tentando de novo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { interpretarWebhook } from "./interpretar.ts";

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
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo não é JSON" }, 400);
  }

  const evento = interpretarWebhook(corpo);
  if (!evento) return json({ ok: true, ignorado: true });

  const { error } = await admin.from("vendas_plataforma_eventos").upsert(
    { ...evento, produto_id: webhook.produto_id, payload: corpo },
    { onConflict: "plataforma,transacao_id,tipo", ignoreDuplicates: true },
  );
  if (error) {
    console.error("vendas-webhook:", error.message);
    return json({ erro: "falha ao gravar" }, 500);
  }
  return json({ ok: true, tipo: evento.tipo, valor: evento.valor, data: evento.data });
});
