-- Habilita Realtime (Postgres Changes) nas tabelas "atividades" e
-- "colunas_atividade" — mesmo padrão já usado em "documentos" (ver
-- 20260912020000_realtime_documentos.sql). REPLICA IDENTITY FULL garante
-- que os eventos de UPDATE/DELETE sempre carreguem a linha inteira (old e
-- new), não só a chave primária — necessário pro Assistant conseguir
-- aplicar o evento direto no estado local sem precisar refazer a busca.
BEGIN;
ALTER TABLE public.atividades REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades;

ALTER TABLE public.colunas_atividade REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.colunas_atividade;
COMMIT;
