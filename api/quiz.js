// Página pública do quiz com o código base do Pixel da Meta já no <head> (18/11/2026, Davi: "instalar aquele código na página").
// /quiz/:slug → esta função devolve o mesmo index.html do app, só que com o código oficial do pixel (o que o assistente da Meta
// manda colar no site) e o PageView saindo antes de o app carregar. O ID vem do próprio quiz (quizzes.pixels; a V2 herda do original),
// então cada quiz usa o seu. Sem pixel ou falha ao ler o quiz: entrega o index.html puro (o app liga o pixel sozinho depois, sem duplicar o PageView).
import { randomUUID } from "node:crypto";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ucjyobemrxqfcoopkcgb.supabase.co";
const CHAVE = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Dk8OEOFtfB49sU2EYrUEEg_0-eUs64C";
const ID_META = /^\d{8,20}$/;

function codigoMeta(id, pv) {
  return `<!-- Meta Pixel Code -->
<script>
window.__metaSsr='${id}';window.__pvId='${pv}';
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${id}');fbq('track','PageView',{},{eventID:'${pv}'});
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->`;
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || "").toLowerCase().trim();
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const buscar = () => fetch(`https://${host}/index.html`).then((r) => (r.ok ? r.text() : Promise.reject(new Error("index"))));
    const pagina = buscar().catch(() => buscar());   // uma segunda tentativa; é um arquivo do próprio site
    let meta = "";
    if (/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/quiz_publico`, {
          method: "POST", headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_slug: slug }),
        });
        const q = r.ok ? await r.json() : null;
        const id = q && q.pixels && typeof q.pixels.meta === "string" ? q.pixels.meta.trim() : "";
        if (ID_META.test(id)) meta = id;
      } catch { /* sem pixel no servidor: o app liga depois */ }
    }
    let html = await pagina;
    if (meta) html = html.replace("</head>", `${codigoMeta(meta, randomUUID())}\n</head>`);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    res.end(html);
  } catch {
    res.statusCode = 502; res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end("Não consegui abrir o quiz agora. Tente de novo.");
  }
}
