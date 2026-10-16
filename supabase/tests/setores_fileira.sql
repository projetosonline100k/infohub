-- O escritório guarda a fileira (0 fundo, 1 frente); outro valor é recusado.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'setores' AND column_name = 'fileira') THEN
    RAISE EXCEPTION 'falta a coluna fileira';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.setores', 'fileira', 'UPDATE') THEN
    RAISE EXCEPTION 'o app não consegue mudar a fileira';
  END IF;
  BEGIN
    UPDATE public.setores SET fileira = 2 WHERE id = (SELECT id FROM public.setores LIMIT 1);
    RAISE EXCEPTION 'aceitou fileira 2';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
