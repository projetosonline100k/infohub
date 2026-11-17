-- Meta por projeto: pessoal, sem acesso anônimo; user_id, mês e projeto não mudam depois de criados.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.painel_mensal_projeto', 'SELECT') THEN RAISE EXCEPTION 'anon não lê'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.painel_mensal_projeto', 'SELECT') THEN RAISE EXCEPTION 'o dono lê'; END IF;
  IF has_column_privilege('authenticated', 'public.painel_mensal_projeto', 'user_id', 'INSERT') OR has_column_privilege('authenticated', 'public.painel_mensal_projeto', 'cliente_id', 'UPDATE') OR has_column_privilege('authenticated', 'public.painel_mensal_projeto', 'mes', 'UPDATE') THEN RAISE EXCEPTION 'user_id vem do login; mês e projeto não mudam'; END IF;
END $$;
ROLLBACK;
