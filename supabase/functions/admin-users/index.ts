import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Único administrador por enquanto. Se um dia precisar de mais de um,
// isso vira uma tabela em vez de uma constante.
const ADMIN_EMAIL = "eu.daviqueiroz22@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Autenticação necessária" }, 401);
    }

    // Cliente com o token de quem chamou, só pra confirmar quem é.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await supabaseCaller.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão inválida" }, 401);
    if ((authData.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
      return json({ error: "Só o administrador pode gerenciar usuários" }, 403);
    }

    // A partir daqui, client com a service role — só depois de confirmar o admin.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { action, ...params } = await req.json();

    if (action === "list") {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      const usuarios = data.users
        .filter((u) => (u.email || "").toLowerCase() !== ADMIN_EMAIL)
        .map((u) => ({
          id: u.id,
          email: u.email,
          nome: (u.user_metadata as Record<string, unknown> | null)?.nome ?? null,
          criado_em: u.created_at,
          confirmado: !!u.email_confirmed_at,
          ultimo_login: u.last_sign_in_at,
        }))
        .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
      return json({ usuarios });
    }

    if (action === "create") {
      const { email, senha, nome } = params as { email?: string; senha?: string; nome?: string };
      const emailLimpo = (email || "").trim().toLowerCase();
      if (!emailLimpo || !emailLimpo.includes("@")) return json({ error: "E-mail inválido" }, 400);
      if (!senha || senha.length < 6) return json({ error: "A senha precisa ter ao menos 6 caracteres" }, 400);

      // email_confirm: true é o que dispensa a confirmação por e-mail —
      // a conta já nasce pronta pra usar, sem passar pelo Lovable/GoTrue.
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: emailLimpo,
        password: senha,
        email_confirm: true,
        user_metadata: nome?.trim() ? { nome: nome.trim() } : undefined,
      });
      if (error) throw error;
      return json({ usuario: { id: data.user?.id, email: data.user?.email } });
    }

    if (action === "resetPassword") {
      const { userId, novaSenha } = params as { userId?: string; novaSenha?: string };
      if (!userId) return json({ error: "Usuário inválido" }, 400);
      if (!novaSenha || novaSenha.length < 6) return json({ error: "A senha precisa ter ao menos 6 caracteres" }, 400);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: novaSenha });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete") {
      const { userId } = params as { userId?: string };
      if (!userId) return json({ error: "Usuário inválido" }, 400);
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (error) {
    console.error("Erro em admin-users:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
