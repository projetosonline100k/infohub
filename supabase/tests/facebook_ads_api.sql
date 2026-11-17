-- Facebook Ads (API): token nunca chega ao app; o app não mexe em campanha, só no vínculo e no teto da conta.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.facebook_conexoes', 'SELECT') THEN RAISE EXCEPTION 'o token não pode ser lido pelo app'; END IF;
  IF has_table_privilege('authenticated', 'public.facebook_oauth_states', 'SELECT') THEN RAISE EXCEPTION 'states não são do app'; END IF;
  IF has_table_privilege('authenticated', 'public.ads_acoes', 'INSERT') OR has_table_privilege('authenticated', 'public.ads_insights_diarios', 'INSERT') THEN RAISE EXCEPTION 'o app não grava ações nem números'; END IF;
  IF NOT has_column_privilege('authenticated', 'public.ads_contas', 'limite_diario', 'UPDATE') THEN RAISE EXCEPTION 'o dono precisa definir o teto'; END IF;
  IF has_column_privilege('authenticated', 'public.ads_contas', 'conta_ref', 'UPDATE') THEN RAISE EXCEPTION 'o app não troca a conta'; END IF;
  IF has_table_privilege('anon', 'public.ads_contas', 'SELECT') THEN RAISE EXCEPTION 'anon não lê contas'; END IF;
END $$;
ROLLBACK;
