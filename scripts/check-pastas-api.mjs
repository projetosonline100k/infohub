// Confere se a PostgREST já enxerga a tabela nova e as colunas novas.
// A raiz /rest/v1/ (OpenAPI) exige secret key nesse projeto, então o teste
// real é pedir as colunas novas: coluna desconhecida -> 400; RLS -> 200 com [].
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const [k, ...rest] = l.split('=');
      return [k.trim(), rest.join('=').trim().replace(/^["']|["']$/g, '')];
    })
);

const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const checks = [
  ['atividades', 'id,pasta_id,responsavel_nome,deleted_at'],
  ['pastas_atividade', 'id,nome,ordem,deleted_at,cliente_id'],
];

for (const [table, cols] of checks) {
  const res = await fetch(`${base}/rest/v1/${table}?select=${cols}&limit=1`, { headers });
  const body = await res.text();
  const ok = res.status === 200;
  console.log(`${table.padEnd(18)} ${ok ? "OK (colunas reconhecidas)" : "FALHOU"}  status=${res.status}  ${ok ? "" : body}`);
}
