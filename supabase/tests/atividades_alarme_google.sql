-- O id do evento do Google do alarme fica na atividade, e o app lê e grava.
BEGIN;
DO $$ BEGIN
  IF NOT has_column_privilege('authenticated', 'public.atividades', 'alarme_google_evento_id', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.atividades', 'alarme_google_evento_id', 'UPDATE') THEN
    RAISE EXCEPTION 'o app não lê/grava o evento do Google do alarme';
  END IF;
END $$;
ROLLBACK;
