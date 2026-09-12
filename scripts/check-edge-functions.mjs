// Verifica se as Edge Functions existem no projeto de destino.
// 404 = não implantada. 401/400/500 = implantada, respondendo.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => {
      const [k, ...rest] = l.split('=');
      return [k.trim(), rest.join('=').trim().replace(/^["']|["']$/g, '')];
    })
);

const base = `${env.VITE_SUPABASE_URL}/functions/v1`;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

for (const fn of ['chat', 'process-pdf', 'backblaze-upload-url', 'instagram-insights', 'admin-users']) {
  try {
    const res = await fetch(`${base}/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
    console.log(`${fn.padEnd(22)} ${res.status}  ${res.status === 404 ? 'NÃO IMPLANTADA' : 'implantada'}  ${body}`);
  } catch (e) {
    console.log(`${fn.padEnd(22)} ERRO  ${e.message}`);
  }
}
