// Métricas de crescimento do Instagram, direto da Meta (sem Windsor).
// Migração 20261015230000_instagram_metricas. Dois jeitos de chamar:
//   - pg_cron, todo dia às 03:10 (chave do Vault em x-metricas-chave): grava o
//     dia anterior de todas as contas conectadas;
//   - botão "Atualizar" do painel (JWT do usuário): grava o dia de hoje, até
//     agora, das contas dele.
// Seguidores vêm com instagram_business_basic. Alcance e visualizações pedem
// instagram_business_manage_insights; sem ela, a linha guarda o erro e o
// painel pede para reconectar a conta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.instagram.com/v23.0";
const RENOVAR_ANTES_MS = 20 * 24 * 60 * 60 * 1000;
const FUSO = "-03:00"; // Brasília, sem horário de verão

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Conexao = { ig_user_id: string; username: string | null; access_token: string; token_expira_em: string | null };

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const diaBrasilia = (deslocamentoDias = 0) =>
  new Date(Date.now() - 3 * 60 * 60 * 1000 + deslocamentoDias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function meta(caminho: string, token: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.error) throw new Error(String(payload?.error?.message ?? `HTTP ${res.status}`));
  return payload;
}

async function tokenAtual(admin: Admin, conexao: Conexao) {
  const expira = conexao.token_expira_em ? Date.parse(conexao.token_expira_em) : 0;
  if (expira && expira - Date.now() > RENOVAR_ANTES_MS) return conexao.access_token;
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", conexao.access_token);
    const res = await fetch(url);
    const payload = await res.json();
    if (!res.ok || !payload.access_token) throw new Error(payload?.error?.message ?? `HTTP ${res.status}`);
    await admin.from("instagram_conexoes").update({
      access_token: payload.access_token,
      token_expira_em: new Date(Date.now() + Number(payload.expires_in ?? 0) * 1000).toISOString(),
      token_atualizado_em: new Date().toISOString(),
    }).eq("ig_user_id", conexao.ig_user_id);
    return payload.access_token as string;
  } catch (e) {
    console.error("falha ao renovar token do Instagram:", (e as Error).message);
    return conexao.access_token;
  }
}

async function coletar(admin: Admin, conexao: Conexao, dia: string) {
  const linha: Record<string, unknown> = { ig_user_id: conexao.ig_user_id, dia, username: conexao.username };
  const erros: string[] = [];
  const token = await tokenAtual(admin, conexao);
  try {
    const perfil = await meta("me", token, { fields: "username,followers_count,media_count" });
    linha.username = perfil.username ?? conexao.username;
    linha.seguidores = perfil.followers_count ?? null;
    linha.publicacoes = perfil.media_count ?? null;
  } catch (e) {
    erros.push(`perfil: ${(e as Error).message}`);
  }
  try {
    const inicio = Date.parse(`${dia}T00:00:00${FUSO}`);
    const fim = Math.min(inicio + 24 * 60 * 60 * 1000, Date.now());
    const insights = await meta(`${conexao.ig_user_id}/insights`, token, {
      metric: "reach,views", period: "day", metric_type: "total_value",
      since: String(Math.floor(inicio / 1000)), until: String(Math.floor(fim / 1000)),
    });
    for (const item of insights?.data ?? []) {
      const valor = Number(item?.total_value?.value);
      if (!Number.isFinite(valor)) continue;
      if (item.name === "reach") linha.alcance = valor;
      if (item.name === "views") linha.visualizacoes = valor;
    }
  } catch (e) {
    erros.push(`insights: ${(e as Error).message}`);
  }
  linha.erro = erros.length ? erros.join(" · ").slice(0, 500) : null;
  const { error } = await admin.from("instagram_metricas_diarias").upsert(linha, { onConflict: "ig_user_id,dia" });
  if (error) throw new Error(error.message);
  return { conta: linha.username, dia, erro: linha.erro };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "não configurado" }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  let consulta = admin.from("instagram_conexoes").select("ig_user_id, username, access_token, token_expira_em");
  let dia: string;
  const chave = req.headers.get("x-metricas-chave");
  if (chave) {
    const { data: ok } = await admin.rpc("instagram_metricas_chave_ok", { p_chave: chave });
    if (!ok) return json({ error: "chave inválida" }, 401);
    dia = diaBrasilia(-1);
  } else {
    const authorization = req.headers.get("authorization");
    if (!anonKey || !authorization) return json({ error: "não autenticado" }, 401);
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "não autenticado" }, 401);
    consulta = consulta.eq("user_id", user.id);
    dia = diaBrasilia(0);
  }

  const { data: conexoes, error } = await consulta;
  if (error) return json({ error: error.message }, 500);
  const resultados = [];
  for (const conexao of (conexoes ?? []) as Conexao[]) {
    try {
      resultados.push(await coletar(admin, conexao, dia));
    } catch (e) {
      console.error("métricas do Instagram:", conexao.ig_user_id, (e as Error).message);
      resultados.push({ conta: conexao.username, dia, erro: (e as Error).message });
    }
  }
  return json({ resultados });
});
