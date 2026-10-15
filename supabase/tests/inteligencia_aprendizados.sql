-- A Inteligência aceita o tipo 'aprendizado'.
BEGIN;
DO $$
BEGIN
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'inteligencia_membros_tipo_check')) NOT LIKE '%aprendizado%' THEN
    RAISE EXCEPTION 'inteligencia_membros não aceita aprendizado';
  END IF;
END $$;
ROLLBACK;
