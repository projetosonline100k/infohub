// Links curtos (11/11/2026): infopro-hub.vercel.app/r/<codigo> → 302 para o endereço completo (quiz + UTM), contando o
// clique. O rewrite está no vercel.json. Usa só a chave pública do projeto (a mesma que vai no site).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ucjyobemrxqfcoopkcgb.supabase.co";
const CHAVE = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Dk8OEOFtfB49sU2EYrUEEg_0-eUs64C";

// Quem monta a prévia do link (Instagram, WhatsApp, etc.) não é gente: em vez de seguir até o site (e mostrar a imagem do
// sistema, "Painel do Infoprodutor"), recebe uma página só com o título do quiz e, se tiver, a imagem do próprio quiz.
// Atenção: o navegador do próprio Instagram/WhatsApp (quando a pessoa clica) também diz "Instagram" no user-agent: por isso NÃO
// se procura essa palavra, só os robôs que montam a prévia (facebookexternalhit, meta-externalagent…).
const ROBO = /facebookexternalhit|meta-external(agent|fetcher)|facebot|^whatsapp|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|crawler|spider|\bbot\b/i;
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function paginaDePrevia(destino) {
  let titulo = "", descricao = "", imagem = "";
  try {
    const m = new URL(destino).pathname.match(/^\/quiz\/([a-z0-9-]+)\/?$/i);
    if (m) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/quiz_previa`, {
        method: "POST", headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_slug: m[1] }),
      });
      const q = r.ok ? await r.json() : null;   // título/descrição/imagem escolhidos na aba Links (ou os da abertura do quiz)
      titulo = q?.titulo || "";
      descricao = q?.descricao || "";
      if (typeof q?.imagem === "string" && /^https:\/\//i.test(q.imagem)) imagem = q.imagem;
    }
  } catch { /* segue sem título */ }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo || "Abrir")}</title>
<meta property="og:type" content="website"><meta property="og:title" content="${esc(titulo || "Abrir")}">
${descricao ? `<meta property="og:description" content="${esc(descricao)}">` : ""}${imagem ? `<meta property="og:image" content="${esc(imagem)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<meta property="og:url" content="${esc(destino)}"><meta name="robots" content="noindex"></head><body></body></html>`;
}

export default async function handler(req, res) {
  const codigo = String((req.query && req.query.c) || "").toLowerCase().trim();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(codigo)) { res.statusCode = 404; res.end("Link não encontrado."); return; }
  try {
    const ehRobo = ROBO.test(String(req.headers["user-agent"] || ""));
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolver_link_curto`, {
      method: "POST", headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_codigo: codigo, p_contar: !ehRobo }),
    });
    const destino = r.ok ? await r.json() : null;
    if (typeof destino === "string" && /^https?:\/\//i.test(destino) && ehRobo) {
      res.statusCode = 200; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(await paginaDePrevia(destino)); return;
    }
    if (typeof destino === "string" && /^https?:\/\//i.test(destino)) { res.statusCode = 302; res.setHeader("Location", destino); res.end(); return; }
  } catch { /* cai no 404 abaixo */ }
  res.statusCode = 404;
  res.end("Link não encontrado.");
}
