// YouTube do projeto (migração 20261016121500_dalila_youtube_shorts):
//   - POST {action: "connect" | "disconnect", clienteId}: o dono do projeto liga
//     ou desliga o canal pelo login Google (como a Agenda). Tokens criptografados
//     com a mesma chave da Agenda; o app nunca lê.
//   - GET /callback: volta do Google, confere o canal e grava a conexão.
//   - POST /publicar (pg_cron a cada minuto, chave do Vault da dalila-publicar):
//     sobe como Short o reel que o Davi programou com "Também no YouTube", na
//     hora marcada, no canal DO PROJETO. Envio retomável: a sessão fica guardada
//     e a próxima chamada pergunta ao Google até onde chegou antes de mandar de
//     novo. Nunca abre uma segunda sessão para o mesmo reel sem contar tentativa.
// Escolher a data e marcar o YouTube é o ok do Davi. Vídeo longo: 2ª etapa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YT = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
const MAX_TENTATIVAS = 3;
// public | private | unlisted. Desde 2026 a documentação do videos.insert diz
// que projeto não verificado não fica mais preso ao privado; se o Google
// devolver outra coisa, fica gravado em yt_privacidade e aparece na tarefa.
const PRIVACIDADE = ["public", "private", "unlisted"].includes(Deno.env.get("YOUTUBE_PRIVACIDADE") ?? "")
  ? Deno.env.get("YOUTUBE_PRIVACIDADE")! : "public";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// deno-lint-ignore no-explicit-any
type Admin = any;

// ---------- Criptografia (a mesma da google-calendar) ----------
const bytesToBase64 = (value: Uint8Array) => {
  let binary = "";
  value.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
};
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function encryptionKey() {
  const secret = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY precisa ter ao menos 32 caracteres");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}
async function decrypt(value: string) {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Token armazenado em formato invalido");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(payload));
  return new TextDecoder().decode(decrypted);
}

function env() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!supabaseUrl || !anonKey || !serviceKey || !clientId || !clientSecret) throw new Error("Integracao com o Google nao configurada");
  return { supabaseUrl, anonKey, serviceKey, clientId, clientSecret, redirectUri: `${supabaseUrl}/functions/v1/youtube/callback` };
}

// Volta para a mesma página do app (só o domínio do app ou o desktop/local).
function voltarPara(candidate?: string | null) {
  const fallback = Deno.env.get("APP_URL") || "http://localhost:8080";
  try {
    const configured = new URL(fallback);
    const url = new URL(candidate || fallback);
    if (!["http:", "https:"].includes(url.protocol)) return fallback;
    const localHosts = new Set(["localhost", "127.0.0.1", "tauri.localhost"]);
    if (url.origin !== configured.origin && !localHosts.has(url.hostname)) return configured.origin;
    return `${url.origin}${url.pathname}`;
  } catch {
    return fallback;
  }
}

class ErroGoogle extends Error {
  constructor(msg: string, readonly definitivo = false, readonly esperarMin = 0) { super(msg); }
}

async function trocarToken(params: Record<string, string>) {
  const { clientId, clientSecret, redirectUri } = env();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, ...params }),
  });
  const data = await res.json();
  if (!res.ok) {
    // invalid_grant = autorização revogada ou vencida (app em modo Teste: 7 dias).
    throw new ErroGoogle(data.error === "invalid_grant"
      ? "a conexão com o YouTube venceu ou foi revogada (conecte o canal de novo)"
      : data.error_description || data.error || "falha ao obter token do Google", data.error === "invalid_grant");
  }
  return data;
}

async function erroDoGoogle(res: Response): Promise<ErroGoogle> {
  const payload = await res.json().catch(() => null);
  const motivo = payload?.error?.errors?.[0]?.reason ?? payload?.error?.status ?? "";
  const msg = String(payload?.error?.message ?? `HTTP ${res.status}`);
  if (["quotaExceeded", "uploadLimitExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(motivo)) {
    return new ErroGoogle(`limite do YouTube (${motivo}); tento de novo mais tarde`, false, 60);
  }
  // 400/401/403 (título inválido, canal sem permissão, token recusado): repetir não resolve.
  return new ErroGoogle(motivo ? `${msg} (${motivo})` : msg, [400, 401, 403].includes(res.status));
}

// ---------- Conexão do canal ----------
type Conexao = {
  cliente_id: string; canal_id: string; canal_titulo: string | null;
  access_token_encrypted: string; refresh_token_encrypted: string; token_expira_em: string;
};

async function tokenAtual(admin: Admin, c: Conexao) {
  if (Date.parse(c.token_expira_em) > Date.now() + 120_000) return decrypt(c.access_token_encrypted);
  const tokens = await trocarToken({ refresh_token: await decrypt(c.refresh_token_encrypted), grant_type: "refresh_token" });
  await admin.from("youtube_conexoes").update({
    access_token_encrypted: await encrypt(tokens.access_token),
    token_expira_em: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq("cliente_id", c.cliente_id);
  return tokens.access_token as string;
}

async function callback(admin: Admin, url: URL) {
  let volta = voltarPara();
  try {
    const estado = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");
    if (!estado) throw new Error("Estado OAuth ausente");
    const { data: salvo } = await admin.from("youtube_oauth_estados").delete()
      .eq("estado", estado).gt("expira_em", new Date().toISOString())
      .select("user_id, cliente_id, voltar_para").maybeSingle();
    if (!salvo) throw new Error("Autorização expirada ou inválida. Tente de novo.");
    volta = voltarPara(salvo.voltar_para);
    if (oauthError) throw new Error(oauthError === "access_denied" ? "Permissão recusada" : oauthError);
    if (!code) throw new Error("Código OAuth ausente");

    const tokens = await trocarToken({ code, grant_type: "authorization_code" });
    if (!tokens.refresh_token) throw new Error("O Google não devolveu o acesso permanente. Remova o Infopro em myaccount.google.com/permissions e conecte de novo.");
    const concedidos = String(tokens.scope ?? "");
    if (!concedidos.includes("youtube.upload")) throw new Error("Marque a permissão de enviar vídeos ao YouTube na tela do Google.");
    const canais = await fetch(`${YT}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!canais.ok) throw await erroDoGoogle(canais);
    const canal = (await canais.json()).items?.[0];
    if (!canal?.id) throw new Error("Essa conta Google não tem canal do YouTube. Entre com a conta dona do canal.");
    const perfil = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } })
      .then((r) => r.ok ? r.json() : {}).catch(() => ({}));

    const { error } = await admin.from("youtube_conexoes").upsert({
      cliente_id: salvo.cliente_id,
      user_id: salvo.user_id,
      canal_id: canal.id,
      canal_titulo: canal.snippet?.title ?? null,
      google_email: perfil.email ?? null,
      access_token_encrypted: await encrypt(tokens.access_token),
      refresh_token_encrypted: await encrypt(tokens.refresh_token),
      token_expira_em: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
      escopo: concedidos,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "cliente_id" });
    if (error) throw error;
    return Response.redirect(`${volta}?youtube=conectado`, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao conectar o YouTube";
    return Response.redirect(`${volta}?youtube=erro&mensagem=${encodeURIComponent(msg)}`, 302);
  }
}

async function acaoDoApp(admin: Admin, req: Request) {
  const settings = env();
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Autenticação necessária" }, 401);
  const caller = createClient(settings.supabaseUrl, settings.anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json({ error: "Sessão inválida" }, 401);
  const body = await req.json();
  const clienteId = String(body.clienteId ?? "");
  // Ligar ou desligar o canal é do dono do projeto.
  const { data: cliente } = await admin.from("clientes").select("id").eq("id", clienteId).eq("user_id", authData.user.id).maybeSingle();
  if (!cliente) return json({ error: "Só o dono do projeto conecta o canal do YouTube." }, 403);

  if (body.action === "connect") {
    const estado = crypto.randomUUID() + crypto.randomUUID();
    const { error } = await admin.from("youtube_oauth_estados").insert({
      estado, user_id: authData.user.id, cliente_id: clienteId, voltar_para: voltarPara(body.returnUrl),
    });
    if (error) throw error;
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.search = new URLSearchParams({
      client_id: settings.clientId, redirect_uri: settings.redirectUri, response_type: "code", scope: SCOPES,
      access_type: "offline", prompt: "consent select_account", state: estado,
    }).toString();
    return json({ authUrl: authUrl.toString() });
  }
  if (body.action === "disconnect") {
    const { data: c } = await admin.from("youtube_conexoes").select("refresh_token_encrypted").eq("cliente_id", clienteId).maybeSingle();
    if (c) {
      const refresh = await decrypt(c.refresh_token_encrypted).catch(() => "");
      if (refresh) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }).catch(() => undefined);
      }
    }
    await admin.from("youtube_conexoes").delete().eq("cliente_id", clienteId);
    return json({ ok: true });
  }
  return json({ error: "Ação desconhecida" }, 400);
}

// ---------- Publicação do Short ----------
type Reel = {
  id: string; cliente_id: string; titulo: string; status: string; legenda: string | null; video_caminho: string | null;
  duracao: number | null; yt_titulo: string | null; yt_status: string | null; yt_sessao: string | null; yt_tentativas: number;
};

// O YouTube não aceita < > em título e descrição; título até 100 caracteres,
// descrição até 5.000 bytes.
const semSinais = (t: string) => t.replace(/</g, "‹").replace(/>/g, "›");
function descricao(legenda: string | null) {
  let d = semSinais(legenda ?? "").trim();
  while (new TextEncoder().encode(d).length > 5000) d = d.slice(0, -50);
  return d;
}

async function soltarShort(admin: Admin, id: string, campos: Record<string, unknown> = {}) {
  await admin.from("reels").update({ ...campos, yt_trava_ate: null, atualizado_em: new Date().toISOString() }).eq("id", id);
}

async function erroShort(admin: Admin, r: Reel, motivo: string) {
  await soltarShort(admin, r.id, { yt_status: "erro", yt_sessao: null, yt_mensagem: `Não publicou no YouTube: ${motivo}` });
  await admin.rpc("reel_links_na_tarefa", { p_reel: r.id });
  await limparVideo(admin, r.id);
  return { erro_youtube: motivo };
}

// A cópia comprimida sai do Storage quando ninguém mais precisa dela: o
// Instagram já saiu (ou o reel foi cancelado) e o Short terminou.
async function limparVideo(admin: Admin, id: string) {
  const { data: r } = await admin.from("reels").select("status, video_caminho, yt_status").eq("id", id).maybeSingle();
  if (!r?.video_caminho || !["publicado", "cancelado"].includes(r.status) || ["programado", "enviando"].includes(r.yt_status ?? "")) return;
  await admin.storage.from("reels").remove([r.video_caminho]);
  await admin.from("reels").update({ video_url: null }).eq("id", id);
}

async function terminou(admin: Admin, r: Reel, video: { id: string; status?: { privacyStatus?: string } }) {
  const privacidade = video.status?.privacyStatus ?? PRIVACIDADE;
  const url = `https://youtube.com/shorts/${video.id}`;
  const curto = (r.duracao ?? 0) > 180 ? " · ATENÇÃO: passa de 3 min, o YouTube trata como vídeo comum" : "";
  const privado = privacidade !== "public" ? ` · saiu ${privacidade === "private" ? "PRIVADO" : privacidade}: deixe público no YouTube Studio` : "";
  await soltarShort(admin, r.id, {
    yt_status: "publicado", yt_video_id: video.id, yt_url: url, yt_privacidade: privacidade, yt_sessao: null,
    yt_publicado_em: new Date().toISOString(), yt_mensagem: `Short no YouTube${curto}${privado}`,
  });
  await admin.rpc("reel_links_na_tarefa", { p_reel: r.id });
  await limparVideo(admin, r.id);
  return { youtube: url, privacidade };
}

// Pergunta ao Google até onde o envio chegou: pronto (vídeo), byte seguinte, ou sessão perdida.
async function situacaoDoEnvio(sessao: string, token: string, total: number): Promise<{ video?: Record<string, unknown>; proximo?: number; perdida?: boolean }> {
  const res = await fetch(sessao, {
    method: "PUT", redirect: "manual",
    headers: { Authorization: `Bearer ${token}`, "Content-Range": `bytes */${total}` },
    body: new Uint8Array(0),
  });
  if (res.status === 200 || res.status === 201) return { video: await res.json() };
  if (res.status === 308) {
    const faixa = res.headers.get("Range")?.match(/bytes=0-(\d+)/);
    return { proximo: faixa ? Number(faixa[1]) + 1 : 0 };
  }
  if (res.status === 404 || res.status === 410) return { perdida: true };
  throw await erroDoGoogle(res);
}

async function publicarShort(admin: Admin, r: Reel) {
  if (!r.video_caminho) return erroShort(admin, r, "o vídeo não está mais no Storage");
  const titulo = semSinais((r.yt_titulo ?? r.titulo).trim()).slice(0, 100);
  if (!titulo) return erroShort(admin, r, "o Short está sem título");

  const { data: conexao } = await admin.from("youtube_conexoes").select("*").eq("cliente_id", r.cliente_id).maybeSingle();
  if (!conexao) return erroShort(admin, r, "este projeto não tem canal do YouTube conectado");

  try {
    const token = await tokenAtual(admin, conexao as Conexao);
    const { data: arquivo, error } = await admin.storage.from("reels").download(r.video_caminho);
    if (error || !arquivo) throw new ErroGoogle(`não deu para abrir o vídeo no Storage: ${error?.message ?? "vazio"}`);
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const total = bytes.length;

    let sessao = r.yt_sessao;
    let inicio = 0;
    if (sessao) {
      const s = await situacaoDoEnvio(sessao, token, total);
      if (s.video) return terminou(admin, r, s.video as { id: string });
      if (s.perdida) sessao = null; else inicio = s.proximo ?? 0;
    }
    if (!sessao) {
      // Cada sessão nova pode virar um vídeo: conta a tentativa antes.
      if (r.yt_tentativas >= MAX_TENTATIVAS) return erroShort(admin, r, `${MAX_TENTATIVAS} tentativas sem sucesso`);
      await admin.from("reels").update({ yt_tentativas: r.yt_tentativas + 1, yt_status: "enviando", yt_mensagem: "Dalila enviando o Short ao YouTube" }).eq("id", r.id);
      const res = await fetch(`${YT_UPLOAD}?uploadType=resumable&part=snippet,status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(total),
        },
        body: JSON.stringify({
          snippet: { title: titulo, description: descricao(r.legenda), categoryId: "22", defaultLanguage: "pt-BR" },
          status: { privacyStatus: PRIVACIDADE, selfDeclaredMadeForKids: false },
        }),
      });
      if (!res.ok) throw await erroDoGoogle(res);
      sessao = res.headers.get("Location");
      if (!sessao) throw new ErroGoogle("o Google não abriu o envio");
      await admin.from("reels").update({ yt_sessao: sessao }).eq("id", r.id);
    }

    const envio = await fetch(sessao, {
      method: "PUT", redirect: "manual",
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "video/mp4",
        "Content-Range": `bytes ${inicio}-${total - 1}/${total}`,
      },
      body: bytes.subarray(inicio),
    });
    if (envio.status === 200 || envio.status === 201) return terminou(admin, r, await envio.json());
    if (envio.status === 308) { await soltarShort(admin, r.id, { yt_mensagem: "Envio ao YouTube pela metade; continuo no próximo minuto" }); return { esperando: "envio pela metade" }; }
    throw await erroDoGoogle(envio);
  } catch (e) {
    const erro = e instanceof ErroGoogle ? e : new ErroGoogle((e as Error).message);
    if (erro.definitivo) return erroShort(admin, r, erro.message);
    // Ambíguo ou limite: a próxima chamada pergunta ao Google antes de mandar de novo.
    const campos: Record<string, unknown> = { yt_mensagem: `YouTube respondeu: ${erro.message}. Confiro antes de tentar de novo.` };
    await soltarShort(admin, r.id, campos);
    if (erro.esperarMin) {
      await admin.from("reels").update({ yt_trava_ate: new Date(Date.now() + erro.esperarMin * 60_000).toISOString() }).eq("id", r.id);
    }
    return { erro: erro.message };
  }
}

async function publicar(admin: Admin) {
  const { data: fila, error } = await admin.rpc("dalila_proximo_short");
  if (error) throw new Error(error.message);
  const r = (fila ?? [])[0] as Reel | undefined;
  if (!r) return { nada: true };
  return { reel: r.id, ...(await publicarShort(admin, r)) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  try {
    const settings = env();
    const admin = createClient(settings.supabaseUrl, settings.serviceKey, { auth: { persistSession: false } });
    if (req.method === "GET" && url.pathname.endsWith("/callback")) return callback(admin, url);
    if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
    if (url.pathname.endsWith("/publicar")) {
      const { data: ok } = await admin.rpc("dalila_chave_ok", { p_chave: req.headers.get("x-dalila-chave") ?? "" });
      if (!ok) return json({ erro: "não autorizado" }, 401);
      return json(await publicar(admin));
    }
    return await acaoDoApp(admin, req);
  } catch (e) {
    console.error("youtube:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
