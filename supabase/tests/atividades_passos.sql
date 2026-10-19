BEGIN;
DO $$
DECLARE padrao text; tipo text;
BEGIN
  SELECT column_default, data_type INTO padrao, tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'atividades' AND column_name = 'passos';
  IF tipo IS DISTINCT FROM 'jsonb' THEN RAISE EXCEPTION 'atividades.passos deveria ser jsonb (veio %)', tipo; END IF;
  IF padrao NOT LIKE '''[]''::jsonb%' THEN RAISE EXCEPTION 'padrão de passos deveria ser [] (veio %)', padrao; END IF;
END $$;
ROLLBACK;
