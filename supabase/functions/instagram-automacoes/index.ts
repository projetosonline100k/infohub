// Webhook da Meta (Instagram API com login do Instagram) para as automações
// por palavra-chave. Ver docs/INSTAGRAM_AUTOMACOES.md.
//
// GET  /                → verificação do webhook (hub.challenge).
// POST /                → eventos da Meta (assinados):
//   - `comments`: comentário num post/reel → DM como private reply e, se
//     houver, resposta pública no comentário;
//   - `messaging`: DM com a palavra-chave ou resposta de story → DM de volta.
// POST /posts           → (JWT do usuário) posts recentes da conta conectada,
//                         para a tela /automacoes escolher onde vale.
// GET  /l/<disparo>/<n>  → redirecionador dos links da DM: conta o clique e
//                         manda para o destino original (funil da tela).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GRAPH = "https://graph.instagram.com/v23.0";
// Renova o token de longa duração (60 dias) quando faltar menos que isso.
const RENOVAR_ANTES_MS = 20 * 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Origem = "comentario" | "dm" | "story";

type Automacao = {
  id: string;
  palavras_chave: string[];
  correspondencia: "contem" | "exata";
  gatilhos: Origem[];
  mensagem_dm: string;
  respostas_comentario: string[];
  media_ids: string[] | null;
  disparos: number;
  rastrear_links: boolean;
};

type Conexao = {
  ig_user_id: string;
  user_id: string;
  access_token: string;
  token_expira_em: string | null;
};

type Evento = {
  origem: Origem;
  eventoId: string;
  texto: string;
  autorId: string;
  autorUsername: string | null;
  mediaId: string | null;
};

type Comentario = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
};

type Mensageria = {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    reply_to?: { story?: { id?: string } };
  };
};

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const bate = (automacao: Pick<Automacao, "palavras_chave" | "correspondencia">, texto: string) => {
  const comentario = normalizar(texto);
  if (!comentario) return false;
  return automacao.palavras_chave.some((palavra) => {
    const chave = normalizar(palavra);
    if (!chave) return false;
    return automacao.correspondencia === "exata"
      ? comentario === chave
      : ` ${comentario} `.includes(` ${chave} `);
  });
};

const URL_RE = /https?:\/\/[^\s<>"']+/g;
// Pontuação colada no fim do link ("veja: https://x.com/a.") não faz parte dele.
const limparLink = (url: string) => url.replace(/[.,;:!?)\]]+$/, "");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A Meta abre o link para montar a prévia na DM; isso não é clique de gente.
const ROBO_RE = /facebookexternalhit|meta-externalagent|facebot|bot\b|crawler|spider|preview|slurp/i;

/** Troca cada link da mensagem pelo redirecionador que conta o clique. */
export function rastrearLinks(texto: string, base: string, disparoId: string) {
  const links: string[] = [];
  const mensagem = texto.replace(URL_RE, (bruto) => {
    const link = limparLink(bruto);
    const resto = bruto.slice(link.length);
    links.push(link);
    return `${base}/l/${disparoId}/${links.length - 1}${resto}`;
  });
  return { mensagem, links };
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string) {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const esperado = hex(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const recebido = cabecalho.slice("sha256=".length);
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

async function graph(caminho: string, token: string, corpo: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const erro = payload?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(String(erro));
  }
  return payload;
}

// deno-lint-ignore no-explicit-any
async function tokenAtual(admin: any, conexao: Conexao) {
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
    // Token ainda pode estar válido; segue com ele e deixa o erro no log.
    console.error("falha ao renovar token do Instagram:", (e as Error).message);
    return conexao.access_token;
  }
}

// deno-lint-ignore no-explicit-any
async function processar(admin: any, igUserId: string, evento: Evento) {
  // Ignora o próprio perfil (a resposta pública e as DMs que a automação manda).
  if (!evento.eventoId || !evento.autorId || evento.autorId === igUserId) return;

  const { data: conexao } = await admin
    .from("instagram_conexoes").select("ig_user_id, user_id, access_token, token_expira_em")
    .eq("ig_user_id", igUserId).maybeSingle();
  if (!conexao) return;

  // Funil: mensagem da pessoa depois de receber uma DM (últimos 7 dias) = respondeu.
  // Roda antes de criar o disparo desta mensagem, então ela não conta para si mesma.
  // O crédito vai só para a DM mais recente: é ela que a pessoa está respondendo.
  if (evento.origem !== "comentario") {
    const { data: ultima } = await admin.from("instagram_automacao_disparos")
      .select("id, respondeu_em")
      .eq("user_id", conexao.user_id).eq("autor_id", evento.autorId).eq("dm_status", "enviada")
      .gte("criado_em", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (ultima && !ultima.respondeu_em) {
      await admin.from("instagram_automacao_disparos")
        .update({ respondeu_em: new Date().toISOString() }).eq("id", ultima.id);
    }
  }
  if (!evento.texto) return;

  const { data: automacoes } = await admin
    .from("instagram_automacoes")
    .select("id, palavras_chave, correspondencia, gatilhos, mensagem_dm, respostas_comentario, media_ids, disparos, rastrear_links")
    .eq("user_id", conexao.user_id).eq("ativo", true).contains("gatilhos", [evento.origem])
    .order("criado_em", { ascending: false });

  const porPost = evento.origem === "comentario";
  const candidatas = ((automacoes ?? []) as Automacao[])
    .filter((a) => !porPost || !a.media_ids?.length || (evento.mediaId && a.media_ids.includes(evento.mediaId)))
    // Automação de um post específico vence a que vale para todos.
    .sort((a, b) => porPost ? Number(!!b.media_ids?.length) - Number(!!a.media_ids?.length) : 0);
  const automacao = candidatas.find((a) => bate(a, evento.texto));
  if (!automacao) return;

  // Trava de idempotência: a Meta reenvia webhooks; o evento_id é único.
  const { data: disparo, error: erroTrava } = await admin
    .from("instagram_automacao_disparos")
    .insert({
      user_id: conexao.user_id,
      automacao_id: automacao.id,
      evento_id: evento.eventoId,
      origem: evento.origem,
      media_id: evento.mediaId,
      autor_id: evento.autorId,
      autor_username: evento.autorUsername,
      texto: evento.texto,
    })
    .select("id").maybeSingle();
  if (erroTrava || !disparo) return;

  const token = await tokenAtual(admin, conexao as Conexao);
  const erros: string[] = [];
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-automacoes`;
  const { mensagem, links } = automacao.rastrear_links
    ? rastrearLinks(automacao.mensagem_dm, base, disparo.id)
    : { mensagem: automacao.mensagem_dm, links: [] as string[] };
  let dmStatus = "enviada";
  let respostaStatus = "nenhuma";

  try {
    await graph(`${igUserId}/messages`, token, {
      // Comentário: private reply (a única forma de abrir DM a partir dele).
      recipient: evento.origem === "comentario" ? { comment_id: evento.eventoId } : { id: evento.autorId },
      message: { text: mensagem },
    });
  } catch (e) {
    dmStatus = "erro";
    erros.push(`DM: ${(e as Error).message}`);
  }

  const respostas = automacao.respostas_comentario.filter((r) => r.trim());
  if (evento.origem === "comentario" && respostas.length) {
    const resposta = respostas[Math.floor(Math.random() * respostas.length)];
    try {
      await graph(`${evento.eventoId}/replies`, token, { message: resposta });
      respostaStatus = "enviada";
    } catch (e) {
      respostaStatus = "erro";
      erros.push(`resposta: ${(e as Error).message}`);
    }
  }

  await admin.from("instagram_automacao_disparos").update({
    dm_status: dmStatus,
    resposta_status: respostaStatus,
    erro: erros.length ? erros.join(" | ") : null,
    links,
  }).eq("id", disparo.id);
  if (dmStatus === "enviada") {
    await admin.from("instagram_automacoes")
      .update({ disparos: automacao.disparos + 1 }).eq("id", automacao.id);
  }
}

// deno-lint-ignore no-explicit-any
async function redirecionar(req: Request, admin: any, disparoId: string, indice: number) {
  const { data: disparo } = UUID_RE.test(disparoId)
    ? await admin.from("instagram_automacao_disparos")
      .select("id, links, cliques, clicou_em").eq("id", disparoId).maybeSingle()
    : { data: null };
  const destino: string | undefined = disparo?.links?.[indice];
  if (!destino) return new Response("Link não encontrado.", { status: 404 });

  if (!ROBO_RE.test(req.headers.get("user-agent") ?? "")) {
    await admin.from("instagram_automacao_disparos").update({
      cliques: (disparo.cliques ?? 0) + 1,
      clicou_em: disparo.clicou_em ?? new Date().toISOString(),
    }).eq("id", disparo.id);
  }
  return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store" } });
}

const doComentario = (c: Comentario): Evento => ({
  origem: "comentario",
  eventoId: c.id ?? "",
  texto: c.text ?? "",
  autorId: c.from?.id ?? "",
  autorUsername: c.from?.username ?? null,
  mediaId: c.media?.id ?? null,
});

const daMensagem = (m: Mensageria): Evento | null => {
  if (!m.message || m.message.is_echo) return null;
  const story = m.message.reply_to?.story;
  return {
    origem: story ? "story" : "dm",
    eventoId: m.message.mid ?? "",
    texto: m.message.text ?? "",
    autorId: m.sender?.id ?? "",
    autorUsername: null,
    mediaId: story?.id ?? null,
  };
};

// deno-lint-ignore no-explicit-any
async function listarPosts(req: Request, admin: any, supabaseUrl: string) {
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("authorization");
  if (!anonKey || !authorization) return json({ error: "não autenticado" }, 401);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "não autenticado" }, 401);

  const { data: conexao } = await admin
    .from("instagram_conexoes").select("ig_user_id, user_id, access_token, token_expira_em")
    .eq("user_id", user.id).order("criado_em").limit(1).maybeSingle();
  if (!conexao) return json({ error: "Instagram não conectado" }, 404);

  const token = await tokenAtual(admin, conexao as Conexao);
  const url = new URL(`${GRAPH}/${conexao.ig_user_id}/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count");
  url.searchParams.set("limit", "30");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await res.json().catch(() => null);
  if (!res.ok) return json({ error: payload?.error?.message ?? "Falha ao consultar o Instagram" }, 502);
  return json({ posts: payload?.data ?? [] });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);

  const link = url.pathname.match(/\/l\/([^/]+)\/(\d+)\/?$/);
  if (req.method === "GET" && link) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return new Response("not configured", { status: 500 });
    return redirecionar(req, createClient(supabaseUrl, serviceKey), link[1], Number(link[2]));
  }

  if (req.method === "GET") {
    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (
      verifyToken &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === verifyToken
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return new Response("not configured", { status: 500 });
  const admin = createClient(supabaseUrl, serviceKey);

  if (url.pathname.endsWith("/posts")) return listarPosts(req, admin, supabaseUrl);

  const segredo = Deno.env.get("META_APP_SECRET");
  if (!segredo) {
    console.error("instagram-automacoes: META_APP_SECRET ausente");
    return new Response("not configured", { status: 500 });
  }
  const corpo = await req.text();
  if (!(await assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), segredo))) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: {
    entry?: { id?: string; changes?: { field?: string; value?: Comentario }[]; messaging?: Mensageria[] }[];
  };
  try {
    payload = JSON.parse(corpo);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    if (!entry.id) continue;
    const eventos: Evento[] = [
      ...(entry.changes ?? []).filter((c) => c.field === "comments" && c.value).map((c) => doComentario(c.value!)),
      ...(entry.messaging ?? []).map(daMensagem).filter((e): e is Evento => !!e),
    ];
    for (const evento of eventos) {
      try {
        await processar(admin, entry.id, evento);
      } catch (e) {
        console.error("instagram-automacoes:", (e as Error).message);
      }
    }
  }
  return new Response("ok", { status: 200 });
});
