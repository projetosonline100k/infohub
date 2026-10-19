-- O app marca o vídeo de referência como usado.
BEGIN;
DO $$ BEGIN
  IF NOT has_column_privilege('authenticated', 'public.videos_referencia', 'usado_em', 'UPDATE') THEN
    RAISE EXCEPTION 'o app não marca o vídeo como usado';
  END IF;
END $$;
ROLLBACK;
