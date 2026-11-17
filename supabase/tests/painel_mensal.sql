-- Meta do mês: pessoal, sem acesso anônimo; user_id e mês não são editáveis pelo app.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.painel_mensal', 'SELECT') THEN RAISE EXCEPTION 'anon não lê'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.painel_mensal', 'SELECT') THEN RAISE EXCEPTION 'o dono lê'; END IF;
  IF has_column_privilege('authenticated', 'public.painel_mensal', 'user_id', 'INSERT') OR has_column_privilege('authenticated', 'public.painel_mensal', 'mes', 'UPDATE') THEN RAISE EXCEPTION 'user_id vem do login e o mês não muda'; END IF;
END $$;
ROLLBACK;
