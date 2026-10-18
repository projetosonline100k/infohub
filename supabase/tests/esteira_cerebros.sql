-- O cérebro da esteira fica no escritório e o app lê e grava.
BEGIN;
DO $$ BEGIN
  IF NOT has_column_privilege('authenticated', 'public.setores', 'cerebros', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.setores', 'cerebros', 'UPDATE') THEN
    RAISE EXCEPTION 'o app não lê/grava o cérebro da esteira';
  END IF;
  IF (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'setores' AND column_name = 'cerebros') IS NULL THEN
    RAISE EXCEPTION 'cérebro sem valor padrão (lista vazia)';
  END IF;
END $$;
ROLLBACK;
