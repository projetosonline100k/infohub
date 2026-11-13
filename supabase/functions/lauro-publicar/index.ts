// Lauro na nuvem: publica no Instagram do perfil dark os vídeos que o Davi programou
// (migração 20261113160000_esteira_dark_instagram). Mesmo cuidado da Dalila (dalila-publicar, reels):
// perfil conectado ao perfil dark (nunca outro), duplicata conferida antes e depois, container guardado,
// tentativa contada antes do media_publish. Escolher a data = ok do Davi; sem data, nada sai.
// O pg_cron chama a cada minuto com a chave do Vault (a mesma da Dalila).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.instagram.com/v25.0";
const RENOVAR_ANTES_MS = 20 * 24 * 60 * 60 * 1000;
const MAX_TENTATIVAS = 3;
const CONTAINER_VALIDO_MS = 23 * 60 * 60 * 1000;

type Roteiro = {
  id: string; perfil_id: string; numero: number; titulo: string; status: string; legenda: string | null;
  video_url: string | null; video_caminho: string | null; programado_para: string | null;
  ig_container_id: string | null; ig_container_em: string | null; publicacao_tentativas: number; criado_em: string;
};
type Conexao = { ig_user_id: string; username: string | null; access_token: string; token_expira_em: string | null };
// deno-lint-ignore no-explicit-any
type Admin = any;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
class ErroMeta extends Error { constructor(msg: string, readonly definitivo = false) { super(msg); } }
const normalizar = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

async function meta(metodo: "GET" | "POST", caminho: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}/${caminho}`);
  const init: RequestInit = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
  if (metodo === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else init.body = new URLSearchParams(params);
  const res = await fetch(url, init);
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.error) {
    const e = payload?.error ?? {};
    const definitivo = [10, 190, 200].includes(Number(e.code)) || /permission/i.test(String(e.message ?? ""));
    throw new ErroMeta(String(e.error_user_msg ?? e.message ?? `HTTP ${res.status}`), definitivo);
  }
  return payload;
}

async function esperarContainer(token: string, id: string) {
  for (let i = 0; i < 10; i++) {
    const { status_code } = await meta("GET", id, token, { fields: "status_code" });
    if (status_code !== "IN_PROGRESS") return status_code as string;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return "IN_PROGRESS";
}

async function tokenAtual(admin: Admin, c: Conexao) {
  const expira = c.token_expira_em ? Date.parse(c.token_expira_em) : 0;
  if (expira && expira - Date.now() > RENOVAR_ANTES_MS) return c.access_token;
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", c.access_token);
    const p = await fetch(url).then((r) => r.json());
    if (!p.access_token) throw new Error(p?.error?.message ?? "sem token");
    await admin.from("instagram_conexoes").update({
      access_token: p.access_token, token_expira_em: new Date(Date.now() + Number(p.expires_in ?? 0) * 1000).toISOString(),
      token_atualizado_em: new Date().toISOString(),
    }).eq("ig_user_id", c.ig_user_id);
    return p.access_token as string;
  } catch (e) {
    console.error("falha ao renovar token do Instagram:", (e as Error).message);
    return c.access_token;
  }
}

async function soltar(admin: Admin, id: string, campos: Record<string, unknown> = {}) {
  await admin.from("esteira_dark_roteiros").update({ ...campos, publicacao_trava_ate: null, atualizado_em: new Date().toISOString() }).eq("id", id);
}

async function procurar(c: Conexao, token: string, r: Roteiro): Promise<string | null> {
  const lista = await meta("GET", `${c.ig_user_id}/media`, token, { fields: "id,caption,media_type,media_product_type,timestamp", limit: "25" });
  const legenda = normalizar(r.legenda);
  const achado = (lista.data ?? []).find((m: { caption?: string; media_type?: string; media_product_type?: string; timestamp?: string }) =>
    (m.media_product_type === "REELS" || m.media_type === "VIDEO") && normalizar(m.caption) === legenda
    && Date.parse(m.timestamp ?? "") >= Date.parse(r.criado_em));
  return achado?.id ?? null;
}

async function finalizar(admin: Admin, r: Roteiro, token: string, mediaId: string) {
  const post = await meta("GET", mediaId, token, { fields: "id,permalink,timestamp" });
  if (r.video_caminho) await admin.storage.from("reels").remove([r.video_caminho]);   // a cópia comprimida sai do Storage
  await soltar(admin, r.id, {
    status: "publicado", ig_media_id: mediaId, permalink: post.permalink ?? null, video_url: null,
    publicado_em: post.timestamp ? new Date(post.timestamp).toISOString() : new Date().toISOString(), mensagem: "Publicado",
  });
  return { publicado: post.permalink };
}

// Volta para "programando" (vídeo pronto, falta nova data) com o motivo; nada sai.
async function devolver(admin: Admin, r: Roteiro, motivo: string) {
  await soltar(admin, r.id, { status: "programando", programado_para: null, ig_container_id: null, ig_container_em: null, mensagem: `Não publicou: ${motivo}` });
  return { devolvido: motivo };
}

async function publicar(admin: Admin, r: Roteiro) {
  if (!r.video_url || !normalizar(r.legenda)) return devolver(admin, r, "faltam o vídeo ou a legenda");
  if (r.status === "programado") await admin.from("esteira_dark_roteiros").update({ status: "publicando", mensagem: "Publicando agora" }).eq("id", r.id);
  const { data: conexao } = await admin.from("instagram_conexoes")
    .select("ig_user_id, username, access_token, token_expira_em").eq("perfil_dark_id", r.perfil_id).maybeSingle();
  if (!conexao) return devolver(admin, r, "nenhum Instagram conectado a este perfil");
  const token = await tokenAtual(admin, conexao);
  try {
    const eu = await meta("GET", "me", token, { fields: "user_id,username" });
    if (String(eu.user_id ?? eu.id) !== conexao.ig_user_id) return devolver(admin, r, "o token não é do perfil conectado");
    const ja = await procurar(conexao, token, r);
    if (ja) return finalizar(admin, r, token, ja);
    if (r.publicacao_tentativas >= MAX_TENTATIVAS) return devolver(admin, r, `${MAX_TENTATIVAS} tentativas sem sucesso`);
    let container = r.ig_container_id && r.ig_container_em && Date.now() - Date.parse(r.ig_container_em) < CONTAINER_VALIDO_MS ? r.ig_container_id : null;
    if (!container) {
      const criado = await meta("POST", `${conexao.ig_user_id}/media`, token, {
        media_type: "REELS", video_url: r.video_url, caption: r.legenda ?? "", share_to_feed: "true",
      });
      container = criado.id as string;
      await admin.from("esteira_dark_roteiros").update({ ig_container_id: container, ig_container_em: new Date().toISOString() }).eq("id", r.id);
    }
    const estado = await esperarContainer(token, container);
    if (estado === "IN_PROGRESS") { await soltar(admin, r.id, { mensagem: "Meta processando o vídeo" }); return { esperando: true }; }
    if (estado !== "FINISHED") {
      const detalhe = await meta("GET", container, token, { fields: "status" }).catch(() => ({}));
      await soltar(admin, r.id, { ig_container_id: null, ig_container_em: null, publicacao_tentativas: r.publicacao_tentativas + 1,
        mensagem: `Meta recusou o vídeo (${estado}${detalhe?.status ? `: ${detalhe.status}` : ""}); tento de novo` });
      return { recusado: estado };
    }
    const jaDeNovo = await procurar(conexao, token, r);
    if (jaDeNovo) return finalizar(admin, r, token, jaDeNovo);
    await admin.from("esteira_dark_roteiros").update({ publicacao_tentativas: r.publicacao_tentativas + 1 }).eq("id", r.id);
    const { id: mediaId } = await meta("POST", `${conexao.ig_user_id}/media_publish`, token, { creation_id: container });
    return finalizar(admin, r, token, mediaId);
  } catch (e) {
    const erro = e as ErroMeta;
    if (erro.definitivo) {
      return devolver(admin, r, /permission/i.test(erro.message) ? "falta a permissão de publicar (reconecte o Instagram no perfil)" : erro.message);
    }
    await soltar(admin, r.id, { mensagem: `Meta respondeu: ${erro.message}. Confiro antes de tentar de novo.` });
    return { erro: erro.message };
  }
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: ok } = await admin.rpc("dalila_chave_ok", { p_chave: req.headers.get("x-dalila-chave") ?? "" });
  if (!ok) return json({ erro: "não autorizado" }, 401);
  try {
    const { data: fila, error } = await admin.rpc("lauro_proximo_roteiro");
    if (error) throw new Error(error.message);
    const r = (fila ?? [])[0] as Roteiro | undefined;
    if (!r) return json({ nada: true });
    try {
      return json({ roteiro: r.id, ...(await publicar(admin, r)) });
    } catch (e) {
      console.error("lauro-publicar:", (e as Error).message);
      await soltar(admin, r.id, { mensagem: `Lauro: ${(e as Error).message}` });
      return json({ roteiro: r.id, erro: (e as Error).message });
    }
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
