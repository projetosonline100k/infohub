// Facebook Ads pela API da Meta, para o dash do Kdu (17/11/2026). Ver docs/agentes/kdu-trafego.md.
//
// POST /link        (JWT) → gera o link de conexão (Login do Facebook; vale 7 dias).
// GET  /c/<state>   → vai para a autorização da Meta.      GET /callback → troca o code pelo token de 60 dias, guarda e lista as contas.
// POST /status      (JWT) → {conectado, nome, expira_em}.
// POST /contas      (JWT) → atualiza as contas de anúncios (de todas as empresas/BMs do usuário).
// POST /recursos    (JWT) {conta_ref} → páginas, contas do Instagram e pixels (para criar anúncio).
// POST /sync        (JWT) {conta_ref, dias} → campanhas, conjuntos, anúncios e números por dia.
// POST /acao        (JWT) {conta_ref, tipo, …} → status | orcamento | criar_campanha | criar_conjunto | criar_anuncio.
// POST /criativo    (JWT) {conta_ref, tipo, nome, arquivo_url} → envia a imagem/vídeo à Meta e guarda em ads_criativos.
// O token fica só em facebook_conexoes (sem acesso pelo app). Tudo que gasta dinheiro nasce PAUSADO; ligar exige teto diário na conta e cabe nele.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CTAS, ESCOPOS, GRAPH, STATUS_VALIDOS, centavos, num, payloadAnuncio, payloadCampanha, payloadConjunto, payloadCriativo, podeLigar, reais, resultadoDaLinha, verbaAtiva, type ItemOrcamento } from "../_shared/facebookAds.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://infopro-hub.vercel.app";
const STATE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const voltarProHub = (params: Record<string, string>) =>
  new Response(null, { status: 302, headers: { Location: `${APP_URL}/?${new URLSearchParams({ ...params, fb: params.erro ? "erro" : "ok" })}` } });
// deno-lint-ignore no-explicit-any
type Admin = any;

class ErroMeta extends Error { constructor(msg: string, public codigo?: number) { super(msg); } }
// deno-lint-ignore no-explicit-any
async function graph(caminho: string, token: string, opcoes: { metodo?: string; params?: Record<string, string>; corpo?: Record<string, string> } = {}): Promise<any> {
  const url = new URL(caminho.startsWith("http") ? caminho : `${GRAPH}/${caminho}`);
  for (const [k, v] of Object.entries(opcoes.params ?? {})) url.searchParams.set(k, v);
  const init: RequestInit = { method: opcoes.metodo ?? "GET" };
  if (opcoes.corpo) { init.method = "POST"; init.headers = { "Content-Type": "application/x-www-form-urlencoded" }; init.body = new URLSearchParams({ ...opcoes.corpo, access_token: token }); }
  else url.searchParams.set("access_token", token);
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new ErroMeta(d.error?.error_user_msg || d.error?.message || `erro ${r.status} da Meta`, d.error?.code);
  return d;
}
// deno-lint-ignore no-explicit-any
async function paginar(caminho: string, token: string, params: Record<string, string>): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const itens: any[] = [];
  let d = await graph(caminho, token, { params: { limit: "500", ...params } });
  for (let i = 0; i < 40; i++) {
    itens.push(...(d.data ?? []));
    if (!d.paging?.next) break;
    d = await graph(d.paging.next, token);
  }
  return itens;
}
async function usuario(req: Request, supabaseUrl: string) {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY"), authorization = req.headers.get("authorization");
  if (!anonKey || !authorization) return null;
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await caller.auth.getUser();
  return user;
}
const lotes = <T,>(lista: T[], n = 400) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

async function registrar(admin: Admin, userId: string, conta: string | null, acao: string, alvo: string | null, detalhe: unknown, erro?: string) {
  await admin.from("ads_acoes").insert({ user_id: userId, conta_ref: conta, acao, alvo, detalhe: detalhe ?? null, ok: !erro, erro: erro ?? null });
}

// ---------------------------------------------------------------- conexão (OAuth)
async function gerarLink(req: Request, admin: Admin, supabaseUrl: string) {
  const user = await usuario(req, supabaseUrl);
  if (!user) return json({ error: "não autenticado" }, 401);
  if (!Deno.env.get("FB_APP_ID") || !Deno.env.get("FB_APP_SECRET")) return json({ error: "Falta configurar FB_APP_ID e FB_APP_SECRET (segredos da função facebook-ads no Supabase)." }, 500);
  const state = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await admin.from("facebook_oauth_states").insert({ state, user_id: user.id });
  if (error) return json({ error: error.message }, 500);
  return json({ url: `${supabaseUrl}/functions/v1/facebook-ads/c/${state}` });
}
async function irParaAutorizacao(admin: Admin, supabaseUrl: string, state: string) {
  const { data: p } = await admin.from("facebook_oauth_states").select("state, criado_em, usado_em").eq("state", state).maybeSingle();
  if (!p || p.usado_em || Date.now() - Date.parse(p.criado_em) > STATE_VALIDADE_MS) return voltarProHub({ erro: "Link de conexão inválido ou vencido. Peça um novo." });
  const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  u.searchParams.set("client_id", Deno.env.get("FB_APP_ID") ?? "");
  u.searchParams.set("redirect_uri", `${supabaseUrl}/functions/v1/facebook-ads/callback`);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", ESCOPOS);
  u.searchParams.set("response_type", "code");
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}
async function callback(url: URL, admin: Admin, supabaseUrl: string) {
  if (url.searchParams.get("error")) return voltarProHub({ erro: "Você cancelou a autorização no Facebook." });
  const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code") ?? "";
  const { data: p } = await admin.from("facebook_oauth_states").select("state, user_id, criado_em, usado_em").eq("state", state).maybeSingle();
  if (!p || p.usado_em || !code || Date.now() - Date.parse(p.criado_em) > STATE_VALIDADE_MS) return voltarProHub({ erro: "Link de conexão inválido ou vencido. Peça um novo." });
  const id = Deno.env.get("FB_APP_ID") ?? "", segredo = Deno.env.get("FB_APP_SECRET") ?? "";
  try {
    const redirect = `${supabaseUrl}/functions/v1/facebook-ads/callback`;
    const curto = await graph("oauth/access_token", "", { params: { client_id: id, client_secret: segredo, redirect_uri: redirect, code } });
    const longo = await graph("oauth/access_token", "", { params: { grant_type: "fb_exchange_token", client_id: id, client_secret: segredo, fb_exchange_token: curto.access_token } });
    const token: string = longo.access_token ?? curto.access_token;
    const eu = await graph("me", token, { params: { fields: "id,name" } });
    const expira = longo.expires_in ? new Date(Date.now() + num(longo.expires_in) * 1000).toISOString() : null;
    const { data: con, error } = await admin.from("facebook_conexoes").upsert({ user_id: p.user_id, fb_user_id: eu.id, nome: eu.name, access_token: token, token_expira_em: expira, escopos: ESCOPOS, atualizado_em: new Date().toISOString() }, { onConflict: "user_id,fb_user_id" }).select("id").single();
    if (error) throw new Error(error.message);
    await admin.from("facebook_oauth_states").update({ usado_em: new Date().toISOString() }).eq("state", state);
    const n = await atualizarContas(admin, p.user_id, con.id, token);
    await registrar(admin, p.user_id, null, "conectar", eu.name, { contas: n });
    return voltarProHub({ ok: "1", conta: eu.name ?? "Facebook" });
  } catch (e) {
    return voltarProHub({ erro: `Não consegui conectar: ${(e as Error).message}` });
  }
}
async function atualizarContas(admin: Admin, userId: string, conexaoId: string, token: string): Promise<number> {
  const contas = await paginar("me/adaccounts", token, { fields: "account_id,name,currency,account_status,business{name}" });
  const linhas = contas.map((c) => ({ user_id: userId, conexao_id: conexaoId, conta_ref: `act_${c.account_id}`, nome: c.name, moeda: c.currency, status: ({ 1: "ativa", 2: "desativada", 3: "com pendência", 7: "em análise", 9: "em carência", 101: "fechada" } as Record<number, string>)[c.account_status] ?? String(c.account_status), empresa: c.business?.name ?? null }));
  for (const l of lotes(linhas)) await admin.from("ads_contas").upsert(l, { onConflict: "user_id,conta_ref", ignoreDuplicates: false });
  // Conta ainda sem projeto: liga ao projeto cujo nome aparece no nome da conta ou da empresa (ex.: "instalivros (1102…)" → Instalivros).
  const [{ data: clientes }, { data: soltas }] = await Promise.all([
    admin.from("clientes").select("id, nome_especialista").eq("user_id", userId).eq("arquivado", false),
    admin.from("ads_contas").select("id, nome, empresa").eq("user_id", userId).is("cliente_id", null),
  ]);
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const c of soltas ?? []) {
    const alvo = norm(`${c.nome ?? ""} ${c.empresa ?? ""}`);
    const achado = (clientes ?? []).filter((x: Admin) => norm(x.nome_especialista).length >= 4 && alvo.includes(norm(x.nome_especialista)));
    if (achado.length === 1) await admin.from("ads_contas").update({ cliente_id: achado[0].id }).eq("id", c.id);
  }
  return linhas.length;
}
// deno-lint-ignore no-explicit-any
async function conta(admin: Admin, userId: string, contaRef: string): Promise<{ conta: any; token: string } | null> {
  const { data: c } = await admin.from("ads_contas").select("*").eq("user_id", userId).eq("conta_ref", contaRef).maybeSingle();
  if (!c) return null;
  const { data: con } = await admin.from("facebook_conexoes").select("access_token, token_expira_em").eq("id", c.conexao_id).maybeSingle();
  if (!con?.access_token) return null;
  if (con.token_expira_em && Date.parse(con.token_expira_em) < Date.now()) return null;
  return { conta: c, token: con.access_token };
}

// ---------------------------------------------------------------- sincronização
async function sincronizar(admin: Admin, userId: string, contaRef: string, dias: number) {
  const ctx = await conta(admin, userId, contaRef);
  if (!ctx) throw new ErroMeta("Conta não encontrada ou conexão vencida: conecte o Facebook de novo.");
  const { token } = ctx;
  const agora = new Date().toISOString();
  const [camps, conjs, ads] = await Promise.all([
    paginar(`${contaRef}/campaigns`, token, { fields: "id,name,status,effective_status,objective,daily_budget" }),
    paginar(`${contaRef}/adsets`, token, { fields: "id,name,campaign_id,status,effective_status,daily_budget,optimization_goal" }),
    paginar(`${contaRef}/ads`, token, { fields: "id,name,adset_id,campaign_id,status,effective_status,creative{thumbnail_url}" }),
  ]);
  const objetivoDe = new Map<string, string>(camps.map((c) => [c.id, c.objective]));
  const humano = (s: string) => ({ ACTIVE: "ativa", PAUSED: "pausada", ARCHIVED: "arquivada", DELETED: "arquivada", WITH_ISSUES: "com problema", DISAPPROVED: "com problema" } as Record<string, string>)[s] ?? "pausada";
  const clienteId = ctx.conta.cliente_id ?? null;
  if (!clienteId) throw new ErroMeta("Escolha o projeto desta conta (aba Contas) antes de sincronizar.");
  if (clienteId) {
    const l = camps.map((c) => ({ cliente_id: clienteId, user_id: userId, conta: contaRef, campanha_ref: c.id, nome: c.name, status: humano(c.effective_status ?? c.status), status_efetivo: c.effective_status, objetivo: c.objective, orcamento_diario: c.daily_budget ? reais(c.daily_budget) : null, atualizado_em: agora, fonte: "api" }));
    for (const x of lotes(l)) await admin.from("ads_campanhas").upsert(x, { onConflict: "cliente_id,campanha_ref" });
  }
  for (const x of lotes(conjs.map((c) => ({ user_id: userId, conta_ref: contaRef, conjunto_ref: c.id, campanha_ref: c.campaign_id, nome: c.name, status: c.status, status_efetivo: c.effective_status, orcamento_diario: c.daily_budget ? reais(c.daily_budget) : null, otimizacao: c.optimization_goal, atualizado_em: agora })))) await admin.from("ads_conjuntos").upsert(x, { onConflict: "conta_ref,conjunto_ref" });
  for (const x of lotes(ads.map((a) => ({ user_id: userId, conta_ref: contaRef, anuncio_ref: a.id, conjunto_ref: a.adset_id, campanha_ref: a.campaign_id, nome: a.name, status: a.status, status_efetivo: a.effective_status, miniatura: a.creative?.thumbnail_url ?? null, atualizado_em: agora })))) await admin.from("ads_anuncios").upsert(x, { onConflict: "conta_ref,anuncio_ref" });
  const ate = new Date(Date.now() - 3 * 3600_000), de = new Date(ate.getTime() - (dias - 1) * 86400_000);
  const intervalo = JSON.stringify({ since: de.toISOString().slice(0, 10), until: ate.toISOString().slice(0, 10) });
  let linhasInsights = 0;
  for (const nivel of ["campaign", "adset", "ad"] as const) {
    const rows = await paginar(`${contaRef}/insights`, token, { level: nivel, time_increment: "1", time_range: intervalo, fields: "campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,actions,action_values" });
    const nome = nivel === "campaign" ? "campanha" : nivel === "adset" ? "conjunto" : "anuncio";
    const l = rows.map((r) => {
      const res = resultadoDaLinha(r, objetivoDe.get(r.campaign_id));
      return { user_id: userId, conta_ref: contaRef, nivel: nome, ref: nivel === "campaign" ? r.campaign_id : nivel === "adset" ? r.adset_id : r.ad_id, dia: r.date_start, gasto: num(r.spend), impressoes: num(r.impressions), alcance: num(r.reach), cliques: num(r.clicks), resultados: res.resultados, tipo_resultado: res.tipo, valor_conversao: res.valor };
    }).filter((x) => x.ref && x.dia);
    for (const x of lotes(l)) await admin.from("ads_insights_diarios").upsert(x, { onConflict: "conta_ref,nivel,ref,dia" });
    linhasInsights += l.length;
  }
  await admin.from("ads_contas").update({ sincronizada_em: agora }).eq("user_id", userId).eq("conta_ref", contaRef);
  return { campanhas: camps.length, conjuntos: conjs.length, anuncios: ads.length, linhas: linhasInsights };
}

// ---------------------------------------------------------------- ações
async function orcamentos(admin: Admin, contaRef: string) {
  const [{ data: c }, { data: j }] = await Promise.all([
    admin.from("ads_campanhas").select("campanha_ref, status_efetivo, orcamento_diario").eq("conta", contaRef),
    admin.from("ads_conjuntos").select("conjunto_ref, campanha_ref, status, orcamento_diario").eq("conta_ref", contaRef),
  ]);
  const camp: ItemOrcamento[] = (c ?? []).map((x: Admin) => ({ nivel: "campanha", ref: x.campanha_ref, campanha_ref: x.campanha_ref, status: x.status_efetivo === "ACTIVE" ? "ACTIVE" : "PAUSED", orcamento_diario: x.orcamento_diario }));
  const conj: ItemOrcamento[] = (j ?? []).map((x: Admin) => ({ nivel: "conjunto", ref: x.conjunto_ref, campanha_ref: x.campanha_ref, status: x.status, orcamento_diario: x.orcamento_diario }));
  return { camp, conj };
}
async function acao(req: Request, admin: Admin, supabaseUrl: string) {
  const user = await usuario(req, supabaseUrl);
  if (!user) return json({ error: "não autenticado" }, 401);
  const d = await req.json().catch(() => ({}));
  const ctx = await conta(admin, user.id, String(d.conta_ref ?? ""));
  if (!ctx) return json({ error: "Conta não encontrada ou conexão vencida: conecte o Facebook de novo." }, 404);
  const { token, conta: c } = ctx;
  const ref = c.conta_ref as string;
  try {
    if (d.tipo === "status") {
      if (!STATUS_VALIDOS.includes(d.status) || !["campanha", "conjunto", "anuncio"].includes(d.nivel) || !/^\d+$/.test(String(d.ref))) return json({ error: "pedido inválido" }, 400);
      if (d.status === "ACTIVE" && d.nivel !== "anuncio") {
        const { camp, conj } = await orcamentos(admin, ref);
        const depois = verbaAtiva(camp, conj, { nivel: d.nivel, ref: String(d.ref) });
        const v = podeLigar(c.limite_diario, depois);
        if (!v.ok) { await registrar(admin, user.id, ref, "ligar_recusado", String(d.ref), { depois }, v.motivo); return json({ error: v.motivo }, 409); }
      } else if (d.status === "ACTIVE") {
        const v = podeLigar(c.limite_diario, 1);   // anúncio: só confere que a conta tem teto definido
        if (!v.ok) return json({ error: v.motivo }, 409);
      }
      await graph(String(d.ref), token, { corpo: { status: d.status } });
      const tabela = d.nivel === "campanha" ? "ads_campanhas" : d.nivel === "conjunto" ? "ads_conjuntos" : "ads_anuncios";
      const chave = d.nivel === "campanha" ? { conta, campo: "campanha_ref" } : d.nivel === "conjunto" ? { conta: ref, campo: "conjunto_ref" } : { conta: ref, campo: "anuncio_ref" };
      if (d.nivel === "campanha") await admin.from(tabela).update({ status_efetivo: d.status, status: d.status === "ACTIVE" ? "ativa" : "pausada" }).eq("conta", ref).eq("campanha_ref", String(d.ref));
      else await admin.from(tabela).update({ status: d.status, status_efetivo: d.status }).eq("conta_ref", chave.conta).eq(chave.campo, String(d.ref));
      await registrar(admin, user.id, ref, d.status === "ACTIVE" ? "ligar" : "pausar", String(d.ref), { nivel: d.nivel });
      return json({ ok: true });
    }
    if (d.tipo === "orcamento") {
      if (!["campanha", "conjunto"].includes(d.nivel) || !/^\d+$/.test(String(d.ref)) || num(d.valor) < 6) return json({ error: "Informe uma verba diária de pelo menos R$ 6,00." }, 400);
      const { camp, conj } = await orcamentos(admin, ref);
      const ligado = (d.nivel === "campanha" ? camp : conj).find((i) => i.ref === String(d.ref))?.status === "ACTIVE";
      if (ligado) {
        const lista = d.nivel === "campanha" ? camp : conj;
        const novos = lista.map((i) => (i.ref === String(d.ref) ? { ...i, orcamento_diario: num(d.valor) } : i));
        const v = podeLigar(c.limite_diario, d.nivel === "campanha" ? verbaAtiva(novos, conj) : verbaAtiva(camp, novos));
        if (!v.ok) { await registrar(admin, user.id, ref, "verba_recusada", String(d.ref), { valor: d.valor }, v.motivo); return json({ error: v.motivo }, 409); }
      }
      await graph(String(d.ref), token, { corpo: { daily_budget: String(centavos(d.valor)) } });
      if (d.nivel === "campanha") await admin.from("ads_campanhas").update({ orcamento_diario: num(d.valor) }).eq("conta", ref).eq("campanha_ref", String(d.ref));
      else await admin.from("ads_conjuntos").update({ orcamento_diario: num(d.valor) }).eq("conta_ref", ref).eq("conjunto_ref", String(d.ref));
      await registrar(admin, user.id, ref, "verba", String(d.ref), { nivel: d.nivel, valor: d.valor });
      return json({ ok: true });
    }
    if (d.tipo === "criar_campanha") {
      const p = payloadCampanha(d);
      if (p.erro) return json({ error: p.erro }, 400);
      const r = await graph(`${ref}/campaigns`, token, { corpo: p.corpo! });
      if (c.cliente_id) await admin.from("ads_campanhas").upsert({ cliente_id: c.cliente_id, user_id: user.id, conta: ref, campanha_ref: r.id, nome: p.corpo!.name, status: "pausada", status_efetivo: "PAUSED", objetivo: p.corpo!.objective, fonte: "api", atualizado_em: new Date().toISOString() }, { onConflict: "cliente_id,campanha_ref" });
      await registrar(admin, user.id, ref, "criar_campanha", r.id, { nome: p.corpo!.name });
      return json({ ok: true, id: r.id });
    }
    if (d.tipo === "criar_conjunto") {
      const p = payloadConjunto(d);
      if (p.erro) return json({ error: p.erro }, 400);
      const r = await graph(`${ref}/adsets`, token, { corpo: p.corpo! });
      await admin.from("ads_conjuntos").upsert({ user_id: user.id, conta_ref: ref, conjunto_ref: r.id, campanha_ref: String(d.campanha_ref), nome: p.corpo!.name, status: "PAUSED", status_efetivo: "PAUSED", orcamento_diario: num(d.orcamento_diario), otimizacao: p.corpo!.optimization_goal, atualizado_em: new Date().toISOString() }, { onConflict: "conta_ref,conjunto_ref" });
      await registrar(admin, user.id, ref, "criar_conjunto", r.id, { nome: p.corpo!.name, orcamento: d.orcamento_diario });
      return json({ ok: true, id: r.id });
    }
    if (d.tipo === "criar_anuncio") {
      const { data: cr } = await admin.from("ads_criativos").select("*").eq("id", String(d.criativo_id ?? "")).eq("user_id", user.id).maybeSingle();
      if (!cr) return json({ error: "Criativo não encontrado." }, 404);
      let miniatura: string | undefined;
      if (cr.fb_video_id) {
        const v = await graph(cr.fb_video_id, token, { params: { fields: "picture,status" } });
        miniatura = v.picture;
        if (v.status?.video_status && v.status.video_status !== "ready") return json({ error: "A Meta ainda está processando o vídeo. Tente de novo em 1 ou 2 minutos." }, 409);
      }
      const pc = payloadCriativo({ nome: d.nome, pagina_id: d.pagina_id, instagram_id: d.instagram_id, texto: d.texto, titulo: d.titulo, descricao: d.descricao, link: d.link, cta: d.cta, imagem_hash: cr.fb_imagem_hash ?? undefined, video_id: cr.fb_video_id ?? undefined, miniatura_url: miniatura });
      if (pc.erro) return json({ error: pc.erro }, 400);
      const criativo = await graph(`${ref}/adcreatives`, token, { corpo: pc.corpo! });
      const pa = payloadAnuncio({ nome: d.nome, conjunto_ref: d.conjunto_ref, criativo_id: criativo.id });
      if (pa.erro) return json({ error: pa.erro }, 400);
      const r = await graph(`${ref}/ads`, token, { corpo: pa.corpo! });
      await admin.from("ads_anuncios").upsert({ user_id: user.id, conta_ref: ref, anuncio_ref: r.id, conjunto_ref: String(d.conjunto_ref), campanha_ref: String(d.campanha_ref ?? ""), nome: pa.corpo!.name, status: "PAUSED", status_efetivo: "PAUSED", miniatura: cr.miniatura, atualizado_em: new Date().toISOString() }, { onConflict: "conta_ref,anuncio_ref" });
      await registrar(admin, user.id, ref, "criar_anuncio", r.id, { nome: d.nome, criativo: cr.nome });
      return json({ ok: true, id: r.id });
    }
    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    const msg = (e as Error).message;
    await registrar(admin, user.id, ref, String(d.tipo), String(d.ref ?? ""), d, msg);
    return json({ error: msg }, e instanceof ErroMeta ? 400 : 500);
  }
}

async function enviarCriativo(req: Request, admin: Admin, supabaseUrl: string) {
  const user = await usuario(req, supabaseUrl);
  if (!user) return json({ error: "não autenticado" }, 401);
  const d = await req.json().catch(() => ({}));
  const ctx = await conta(admin, user.id, String(d.conta_ref ?? ""));
  if (!ctx) return json({ error: "Conta não encontrada ou conexão vencida." }, 404);
  const url = String(d.arquivo_url ?? "");
  if (!url.startsWith(`${supabaseUrl}/storage/v1/object/public/ads-criativos/${user.id}/`)) return json({ error: "arquivo inválido" }, 400);
  const tipo = d.tipo === "video" ? "video" : "imagem";
  const nome = String(d.nome ?? "Criativo").slice(0, 120);
  try {
    let hash: string | null = null, videoId: string | null = null, miniatura: string | null = tipo === "imagem" ? url : null;
    if (tipo === "imagem") {
      const arq = await fetch(url);
      const bytes = new Uint8Array(await arq.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await graph(`${ctx.conta.conta_ref}/adimages`, ctx.token, { corpo: { bytes: btoa(bin) } });
      hash = Object.values(r.images ?? {}).map((x) => (x as { hash: string }).hash)[0] ?? null;
      if (!hash) throw new ErroMeta("A Meta não devolveu a imagem enviada.");
    } else {
      const r = await graph(`${ctx.conta.conta_ref}/advideos`, ctx.token, { corpo: { file_url: url, name: nome } });
      videoId = r.id;
    }
    const { data, error } = await admin.from("ads_criativos").insert({ user_id: user.id, conta_ref: ctx.conta.conta_ref, tipo, nome, arquivo_url: url, miniatura, fb_imagem_hash: hash, fb_video_id: videoId, pasta: d.pasta ? String(d.pasta).slice(0, 80) : null }).select("id").single();
    if (error) throw new Error(error.message);
    await registrar(admin, user.id, ctx.conta.conta_ref, "criativo", data.id, { tipo, nome });
    return json({ ok: true, id: data.id });
  } catch (e) {
    await registrar(admin, user.id, ctx.conta.conta_ref, "criativo", null, { tipo, nome }, (e as Error).message);
    return json({ error: (e as Error).message }, 400);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "não configurado" }, 500);
  const admin = createClient(supabaseUrl, serviceKey);
  const curto = url.pathname.match(/\/c\/([0-9a-f]{16,64})\/?$/);
  if (req.method === "GET" && curto) return irParaAutorizacao(admin, supabaseUrl, curto[1]);
  if (req.method === "GET" && url.pathname.endsWith("/callback")) return callback(url, admin, supabaseUrl);
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const rota = url.pathname.split("/").filter(Boolean).pop();
  try {
    if (rota === "link") return await gerarLink(req, admin, supabaseUrl);
    if (rota === "acao") return await acao(req, admin, supabaseUrl);
    if (rota === "criativo") return await enviarCriativo(req, admin, supabaseUrl);
    const user = await usuario(req, supabaseUrl);
    if (!user) return json({ error: "não autenticado" }, 401);
    const corpo = await req.json().catch(() => ({}));
    if (rota === "status") {
      const { data: con } = await admin.from("facebook_conexoes").select("nome, token_expira_em").eq("user_id", user.id).order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
      return json({ conectado: !!con, nome: con?.nome ?? null, expira_em: con?.token_expira_em ?? null, configurado: !!(Deno.env.get("FB_APP_ID") && Deno.env.get("FB_APP_SECRET")) });
    }
    if (rota === "contas") {
      const { data: cons } = await admin.from("facebook_conexoes").select("id, access_token").eq("user_id", user.id);
      let n = 0;
      for (const c of cons ?? []) n += await atualizarContas(admin, user.id, c.id, c.access_token);
      return json({ ok: true, contas: n });
    }
    if (rota === "recursos") {
      const ctx = await conta(admin, user.id, String(corpo.conta_ref ?? ""));
      if (!ctx) return json({ error: "Conta não encontrada ou conexão vencida." }, 404);
      const [paginas, pixels] = await Promise.all([
        paginar("me/accounts", ctx.token, { fields: "id,name,instagram_business_account{id,username}" }).catch(() => []),
        paginar(`${ctx.conta.conta_ref}/adspixels`, ctx.token, { fields: "id,name" }).catch(() => []),
      ]);
      return json({ paginas: paginas.map((p) => ({ id: p.id, nome: p.name, instagram_id: p.instagram_business_account?.id ?? null, instagram: p.instagram_business_account?.username ?? null })), pixels, ctas: CTAS });
    }
    if (rota === "sync") {
      const r = await sincronizar(admin, user.id, String(corpo.conta_ref ?? ""), Math.min(90, Math.max(1, num(corpo.dias) || 30)));
      return json({ ok: true, ...r });
    }
    return json({ error: "rota desconhecida" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof ErroMeta ? 400 : 500);
  }
});
