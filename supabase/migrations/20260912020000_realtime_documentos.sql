-- Habilita Realtime (Postgres Changes) na tabela "documentos", pra quem
-- está com o documento aberto ver ao vivo quando outra pessoa (dono ou
-- convidado de um link compartilhado) edita o título ou o conteúdo.
-- REPLICA IDENTITY FULL garante que o evento de UPDATE sempre carregue a
-- linha inteira, não só a chave primária.
BEGIN;
ALTER TABLE public.documentos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos;
COMMIT;
