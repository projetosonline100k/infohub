import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1).replace(/^["']|["']$/g,'')]; }));
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
for (const table of ['clientes','pesquisas']) {
 const {count,error}=await client.from(table).select('id',{head:true,count:'exact'});
 if(error) { console.log('API_FAILED',table,error.code || 'NETWORK'); process.exitCode=1; }
 else { console.log('API_OK',table,'anonymous_visible='+count); if(table==='clientes' && count!==0) process.exitCode=1; }
}
const {data,error}=await client.auth.getSession();
console.log('AUTH_CLIENT',error?'FAILED':'OK');
const manifest=JSON.parse(fs.readFileSync(new URL('../.migration.local/storage-manifest.json',import.meta.url),'utf8'));
const directory=new URL('../.migration.local/storage/',import.meta.url);
fs.mkdirSync(directory,{recursive:true,mode:0o700});
let available=0;
for(const [i,item] of manifest.entries()) {
 try {
  const path=[item.bucket,...item.name.split('/')].map(encodeURIComponent).join('/');
  const response=await fetch('https://ofnhmqhycahbygfadubd.supabase.co/storage/v1/object/public/'+path,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) {console.log('SOURCE_BANNER_UNAVAILABLE',i,response.status);continue;}
  const body=Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(new URL(String(i),directory),body,{mode:0o600});
  available++;
 }catch { console.log('SOURCE_BANNER_UNAVAILABLE',i,'NETWORK'); }
}
console.log('BANNERS_DOWNLOADED',available,'of',manifest.length);
