-- Fundos do painel: pessoal; o app só troca a url; anon não lê a tabela.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.painel_fundos', 'SELECT') THEN RAISE EXCEPTION 'anon não lê'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.painel_fundos', 'SELECT') THEN RAISE EXCEPTION 'o dono lê'; END IF;
  IF has_column_privilege('authenticated', 'public.painel_fundos', 'user_id', 'INSERT') OR has_column_privilege('authenticated', 'public.painel_fundos', 'cliente_id', 'UPDATE') THEN RAISE EXCEPTION 'user_id vem do login; o projeto não muda'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'painel-fundos' AND file_size_limit <= 8388608) THEN RAISE EXCEPTION 'bucket com limite de tamanho'; END IF;
END $$;
ROLLBACK;
