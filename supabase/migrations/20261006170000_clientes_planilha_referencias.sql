-- Link da planilha do Google com os vídeos de referência do projeto: o
-- Conteúdo puxa os vídeos novos dela sozinho (sincronização automática).
alter table public.clientes add column if not exists planilha_referencias_url text;
