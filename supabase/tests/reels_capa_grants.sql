-- O app precisa ler as colunas da capa do reel (a tela de programar lê todas de uma vez).
BEGIN;
DO $$
BEGIN
  IF NOT (has_column_privilege('authenticated', 'public.reels', 'capa_ms', 'SELECT')
          AND has_column_privilege('authenticated', 'public.reels', 'capa_sugestoes', 'SELECT')
          AND has_column_privilege('authenticated', 'public.reels', 'capa_pelo_davi', 'SELECT')) THEN
    RAISE EXCEPTION 'authenticated não lê as colunas da capa do reel';
  END IF;
  IF has_column_privilege('anon', 'public.reels', 'capa_ms', 'SELECT') THEN
    RAISE EXCEPTION 'anon não pode ler reels';
  END IF;
END $$;
ROLLBACK;
