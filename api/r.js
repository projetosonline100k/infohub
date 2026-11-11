// Links curtos (11/11/2026): infopro-hub.vercel.app/r/<codigo> → 302 para o endereço completo (quiz + UTM), contando o
// clique. O rewrite está no vercel.json. Usa só a chave pública do projeto (a mesma que vai no site).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ucjyobemrxqfcoopkcgb.supabase.co";
const CHAVE = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Dk8OEOFtfB49sU2EYrUEEg_0-eUs64C";

export default async function handler(req, res) {
  const codigo = String((req.query && req.query.c) || "").toLowerCase().trim();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(codigo)) { res.statusCode = 404; res.end("Link não encontrado."); return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolver_link_curto`, {
      method: "POST", headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_codigo: codigo }),
    });
    const destino = r.ok ? await r.json() : null;
    if (typeof destino === "string" && /^https?:\/\//i.test(destino)) { res.statusCode = 302; res.setHeader("Location", destino); res.end(); return; }
  } catch { /* cai no 404 abaixo */ }
  res.statusCode = 404;
  res.end("Link não encontrado.");
}
