-- Kdu (Facebook Ads): o app só lê e pede coleta; não grava números nem mexe em campanha.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.membros WHERE lower(nome) = 'kdu' AND eh_ia) THEN RAISE EXCEPTION 'Kdu não foi criado'; END IF;
  IF has_table_privilege('authenticated', 'public.ads_metricas_diarias', 'INSERT') OR has_table_privilege('authenticated', 'public.ads_campanhas', 'UPDATE') THEN
    RAISE EXCEPTION 'o app não pode gravar números nem campanhas';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.ads_metricas_diarias', 'SELECT') THEN RAISE EXCEPTION 'o app precisa ler os números'; END IF;
  IF has_table_privilege('anon', 'public.ads_campanhas', 'SELECT') THEN RAISE EXCEPTION 'anon não lê campanhas'; END IF;
END $$;
ROLLBACK;
