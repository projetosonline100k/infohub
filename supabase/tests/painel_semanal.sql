-- Painel semanal: pessoal, sem acesso anônimo; o dono não troca o user_id nem a semana.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.painel_semanal', 'SELECT') THEN RAISE EXCEPTION 'anon não lê o painel'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.painel_semanal', 'SELECT') THEN RAISE EXCEPTION 'o dono lê o painel'; END IF;
  IF has_column_privilege('authenticated', 'public.painel_semanal', 'user_id', 'INSERT') OR has_column_privilege('authenticated', 'public.painel_semanal', 'user_id', 'UPDATE') THEN RAISE EXCEPTION 'user_id vem do login'; END IF;
  IF has_column_privilege('authenticated', 'public.painel_semanal', 'semana', 'UPDATE') THEN RAISE EXCEPTION 'a semana não muda'; END IF;
  IF NOT has_column_privilege('authenticated', 'public.painel_semanal', 'missao', 'UPDATE') THEN RAISE EXCEPTION 'a missão é editável'; END IF;
END $$;
ROLLBACK;
