import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const bytesToBase64 = (value: Uint8Array) => {
  let binary = "";
  value.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function encryptionKey() {
  const secret = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY precisa ter ao menos 32 caracteres");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string) {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Token armazenado em formato invalido");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(payload),
  );
  return new TextDecoder().decode(decrypted);
}

function env() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!supabaseUrl || !anonKey || !serviceKey || !clientId || !clientSecret) {
    throw new Error("Integracao Google Calendar nao configurada");
  }
  return {
    supabaseUrl,
    anonKey,
    serviceKey,
    clientId,
    clientSecret,
    redirectUri: `${supabaseUrl}/functions/v1/google-calendar/callback`,
  };
}

function safeReturnUrl(candidate?: string) {
  const fallback = Deno.env.get("APP_URL") || "http://localhost:8080";
  try {
    const configured = new URL(fallback);
    const url = new URL(candidate || fallback);
    if (!["http:", "https:"].includes(url.protocol)) return fallback;
    const localHosts = new Set(["localhost", "127.0.0.1", "tauri.localhost"]);
    if (url.origin !== configured.origin && !localHosts.has(url.hostname)) return `${configured.origin}/agenda`;
    return `${url.origin}/agenda`;
  } catch {
    return fallback;
  }
}

async function exchangeToken(params: Record<string, string>) {
  const { clientId, clientSecret, redirectUri } = env();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, ...params }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Falha ao obter token do Google");
  return data;
}

async function googleFetch(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Erro na API do Google Calendar");
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const settings = env();
  const admin = createClient(settings.supabaseUrl, settings.serviceKey);

  // O callback e a unica rota chamada diretamente pelo Google e, por isso,
  // valida o nonce descartavel em vez de um JWT do Supabase.
  if (req.method === "GET" && url.pathname.endsWith("/callback")) {
    let returnUrl = safeReturnUrl();
    try {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const oauthError = url.searchParams.get("error");
      if (!state) throw new Error("Estado OAuth ausente");

      const { data: savedState } = await admin
        .from("google_calendar_oauth_states")
        .delete()
        .eq("state", state)
        .gt("expires_at", new Date().toISOString())
        .select("user_id, return_url")
        .maybeSingle();
      if (!savedState) throw new Error("Autorizacao expirada ou invalida");
      returnUrl = safeReturnUrl(savedState.return_url);
      if (oauthError) throw new Error(oauthError === "access_denied" ? "Permissao recusada" : oauthError);
      if (!code) throw new Error("Codigo OAuth ausente");

      const tokens = await exchangeToken({ code, grant_type: "authorization_code" });
      if (!tokens.refresh_token) throw new Error("Google nao retornou refresh token. Revogue o acesso e conecte novamente.");
      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = profileResponse.ok ? await profileResponse.json() : {};
      const { error } = await admin.from("google_calendar_connections").upsert({
        user_id: savedState.user_id,
        google_email: profile.email || null,
        access_token_encrypted: await encrypt(tokens.access_token),
        refresh_token_encrypted: await encrypt(tokens.refresh_token),
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        scope: tokens.scope || SCOPES,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return Response.redirect(`${returnUrl}?google_calendar=connected`, 302);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao conectar Google Calendar";
      return Response.redirect(`${returnUrl}?google_calendar=error&message=${encodeURIComponent(message)}`, 302);
    }
  }

  if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Autenticacao necessaria" }, 401);
    const caller = createClient(settings.supabaseUrl, settings.anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessao invalida" }, 401);
    const userId = authData.user.id;
    const body = await req.json();
    const action = body.action as string;

    if (action === "connect") {
      const state = crypto.randomUUID() + crypto.randomUUID();
      const { error } = await admin.from("google_calendar_oauth_states").insert({
        state,
        user_id: userId,
        return_url: safeReturnUrl(body.returnUrl),
      });
      if (error) throw error;
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.search = new URLSearchParams({
        client_id: settings.clientId,
        redirect_uri: settings.redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      }).toString();
      return json({ authUrl: authUrl.toString() });
    }

    const { data: connection } = await admin
      .from("google_calendar_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (action === "status") {
      return json({ connected: !!connection, email: connection?.google_email || null });
    }
    if (action === "disconnect") {
      if (connection) {
        const refreshToken = await decrypt(connection.refresh_token_encrypted);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }).catch(() => undefined);
      }
      await admin.from("google_calendar_connections").delete().eq("user_id", userId);
      return json({ ok: true });
    }
    if (!connection) return json({ error: "Google Calendar nao conectado", code: "NOT_CONNECTED" }, 409);

    let accessToken = await decrypt(connection.access_token_encrypted);
    if (new Date(connection.token_expires_at).getTime() < Date.now() + 60_000) {
      const tokens = await exchangeToken({
        refresh_token: await decrypt(connection.refresh_token_encrypted),
        grant_type: "refresh_token",
      });
      accessToken = tokens.access_token;
      await admin.from("google_calendar_connections").update({
        access_token_encrypted: await encrypt(accessToken),
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
    }

    if (action === "calendars") {
      const data = await googleFetch("/users/me/calendarList?minAccessRole=reader", accessToken);
      return json({ calendars: data.items || [] });
    }
    if (action === "events") {
      const ids = Array.isArray(body.calendarIds) && body.calendarIds.length ? body.calendarIds : ["primary"];
      const params = new URLSearchParams({
        timeMin: body.timeMin,
        timeMax: body.timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        timeZone: body.timeZone || "America/Sao_Paulo",
      });
      const lists = await Promise.all(ids.map(async (calendarId: string) => {
        const data = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, accessToken);
        return (data.items || []).map((event: Record<string, unknown>) => ({ ...event, calendarId }));
      }));
      return json({ events: lists.flat() });
    }
    if (action === "create") {
      const calendarId = body.calendarId || "primary";
      const event = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
        method: "POST", body: JSON.stringify(body.event),
      });
      return json({ event: { ...event, calendarId } });
    }
    if (action === "update") {
      if (!body.eventId) return json({ error: "Evento invalido" }, 400);
      const calendarId = body.calendarId || "primary";
      const event = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.eventId)}`, accessToken, {
        method: "PUT", body: JSON.stringify(body.event),
      });
      return json({ event: { ...event, calendarId } });
    }
    // Responder a um convite (aceitar/talvez/recusar). Muda só a SUA linha na
    // lista de convidados e avisa o organizador, como o botão do Google.
    if (action === "respond") {
      const respostas: Record<string, string> = { aceitar: "accepted", talvez: "tentative", recusar: "declined" };
      const responseStatus = respostas[body.resposta];
      if (!body.eventId || !responseStatus) return json({ error: "Resposta invalida" }, 400);
      const calendarId = body.calendarId || "primary";
      const caminho = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.eventId)}`;
      const atual = await googleFetch(caminho, accessToken);
      const attendees = (atual.attendees || []) as Record<string, unknown>[];
      if (!attendees.some((a) => a.self === true)) return json({ error: "Voce nao esta na lista de convidados deste evento" }, 400);
      const event = await googleFetch(`${caminho}?sendUpdates=all`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({ attendees: attendees.map((a) => (a.self === true ? { ...a, responseStatus } : a)) }),
      });
      return json({ event: { ...event, calendarId } });
    }
    if (action === "delete") {
      if (!body.eventId) return json({ error: "Evento invalido" }, 400);
      const calendarId = body.calendarId || "primary";
      await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.eventId)}`, accessToken, { method: "DELETE" });
      return json({ ok: true });
    }
    return json({ error: "Acao desconhecida" }, 400);
  } catch (error) {
    console.error("Erro google-calendar:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
