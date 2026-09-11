import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const local = new URL('../.migration.local/', import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.migration.local', import.meta.url), 'utf8')
    .split('\n').filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.log('STORAGE_KEY_MISSING: configure SUPABASE_SECRET_KEY em .env.migration.local.');
  process.exit(2);
}
const base = 'https://ucjyobemrxqfcoopkcgb.supabase.co';
const client = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
const manifest = JSON.parse(fs.readFileSync(new URL('storage-manifest.json', local), 'utf8'));
const results = [];
for (const [index, item] of manifest.entries()) {
  const body = fs.readFileSync(new URL('storage/' + index, local));
  const expected = crypto.createHash('sha256').update(body).digest('hex');
  const { error } = await client.storage.from(item.bucket).upload(item.name, body, {
    contentType: item.metadata.mimetype || 'application/octet-stream',
    cacheControl: '3600',
    upsert: true,
  });
  if (error) {
    console.log('UPLOAD_FAILED', index, 'status=' + (error.statusCode || 'unknown'));
    process.exit(1);
  }
  const objectPath = [item.bucket, ...item.name.split('/')].map(encodeURIComponent).join('/');
  const response = await fetch(base + '/storage/v1/object/public/' + objectPath, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    console.log('VERIFY_FAILED', index, response.status);
    process.exit(1);
  }
  const downloaded = Buffer.from(await response.arrayBuffer());
  const actual = crypto.createHash('sha256').update(downloaded).digest('hex');
  if (actual !== expected) {
    console.log('HASH_MISMATCH', index);
    process.exit(1);
  }
  results.push({ index, sha256: actual, bytes: downloaded.length });
  console.log('BANNER_VERIFIED', index + 1, 'of', manifest.length);
}
fs.writeFileSync(new URL('storage-result.json', local), JSON.stringify({ verified: results.length, results }, null, 2));
console.log('STORAGE_COPY_OK', results.length);
