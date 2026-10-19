-- As estruturas de headline ficam no projeto e o app lê e grava.
BEGIN;
DO $$ BEGIN
  IF NOT has_column_privilege('authenticated', 'public.clientes', 'estruturas_headline', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.clientes', 'estruturas_headline', 'UPDATE') THEN
    RAISE EXCEPTION 'o app não lê/grava as estruturas de headline';
  END IF;
END $$;
ROLLBACK;
