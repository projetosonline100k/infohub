// Edite estes valores pro seu ambiente.
//
// SUPABASE_URL / SUPABASE_ANON_KEY são os MESMOS valores públicos já usados
// pelo app web (src/integrations/supabase/client.ts / .env). A "anon /
// publishable key" do Supabase é feita pra ser pública — quem protege os
// dados é a Row Level Security no banco (RLS: `user_id = auth.uid()`), não
// o segredo dessa chave. O único dado sensível de verdade é o access_token
// da sessão do usuário autenticado, que a extensão recebe via bridge.js e
// guarda só em chrome.storage.local (nunca em localStorage de página, nunca
// em outra extensão).
//
// APP_URL precisa bater com os `matches` do primeiro bloco de
// content_scripts no manifest.json (é lá que o Chrome decide em quais
// páginas o bridge.js roda) — se mudar um, mude o outro.
const INFOPRO_CONFIG = {
  SUPABASE_URL: "https://ucjyobemrxqfcoopkcgb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Dk8OEOFtfB49sU2EYrUEEg_0-eUs64C",
  APP_URL: "http://localhost:5183",
};
