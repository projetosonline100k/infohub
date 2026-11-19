import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Conta de acesso dos embaixadores (19/11/2026, Davi: "eu preciso conseguir cadastrar o pessoal, com senha").
// Quem tem acesso ao projeto (dono ou equipe com a área Conteúdo) cria a conta do embaixador já com a senha, ou troca a senha dele.
// O acesso é provado lendo a linha do embaixador com o token de quem chamou (a RLS decide); só então a service role cria/atualiza o usuário.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authorization || !url || !anon || !service) return json({ error: "Autenticação necessária" }, 401);

    const chamador = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: u, error: eu } = await chamador.auth.getUser();
    if (eu || !u.user) return json({ error: "Sessão inválida" }, 401);

    const { action, embaixador_id, senha } = await req.json() as { action?: string; embaixador_id?: string; senha?: string };
    if (!embaixador_id) return json({ error: "Embaixador inválido" }, 400);
    if (!senha || senha.length < 6) return json({ error: "A senha precisa ter ao menos 6 caracteres" }, 400);

    // Acesso: só enxerga a linha quem tem acesso ao projeto dela.
    const { data: permitido } = await chamador.from("embaixadores").select("id").eq("id", embaixador_id).maybeSingle();
    if (!permitido) return json({ error: "Sem acesso a este embaixador" }, 403);

    const admin = createClient(url, service);
    const { data: emb } = await admin.from("embaixadores").select("id, email, auth_user_id").eq("id", embaixador_id).single();
    if (!emb) return json({ error: "Embaixador não encontrado" }, 404);

    if (action === "senha") {
      if (!emb.auth_user_id) return json({ error: "Este embaixador ainda não tem conta" }, 400);
      const { error } = await admin.auth.admin.updateUserById(emb.auth_user_id, { password: senha });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "criar") {
      if (emb.auth_user_id) return json({ error: "Este embaixador já tem conta" }, 400);
      const email = String(emb.email).trim().toLowerCase();
      let userId: string | null = null;
      let existente = false;
      const { data: novo, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { origem: "embaixador" } });
      if (error) {
        if (!/already|registered|exists/i.test(error.message)) throw error;
        // Já existe uma conta com esse e-mail: liga a ela (não troca a senha dela).
        for (let pagina = 1; pagina <= 20 && !userId; pagina++) {
          const { data: lista } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
          const achado = lista?.users.find((x) => (x.email || "").toLowerCase() === email);
          if (achado) userId = achado.id;
          if (!lista || lista.users.length < 1000) break;
        }
        if (!userId) throw error;
        existente = true;
      } else userId = novo.user?.id ?? null;
      if (!userId) throw new Error("Não consegui criar a conta");
      const { error: e2 } = await admin.from("embaixadores").update({ auth_user_id: userId, convite: null }).eq("id", embaixador_id);
      if (e2) throw e2;
      return json({ ok: true, existente });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (error) {
    console.error("Erro em embaixador-conta:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
