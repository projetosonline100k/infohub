-- A peça da esteira guarda o documento dela (o app lê).
BEGIN;
DO $$ BEGIN
  IF NOT has_column_privilege('authenticated', 'public.esteira_itens', 'documento_id', 'SELECT') THEN
    RAISE EXCEPTION 'o app não lê o documento da peça';
  END IF;
END $$;
ROLLBACK;
