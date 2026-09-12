-- Permite arquivar clientes sem apagar nada; arquivados somem da lista
-- padrão mas continuam acessíveis pela aba "Arquivados".
BEGIN;
ALTER TABLE public.clientes ADD COLUMN arquivado boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
COMMIT;
