-- Regressão: a arrumação do escritório aceita 9 salas e recusa formato errado.
BEGIN;
DO $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.clientes LIMIT 1;
  UPDATE public.clientes SET escritorio_layout = '{"celulas":["recepcao","reuniao","copa","descanso","vazio","vazio","vazio","vazio","vazio"]}' WHERE id = cid;
  BEGIN
    UPDATE public.clientes SET escritorio_layout = '{"celulas":["recepcao"]}' WHERE id = cid;
    RAISE EXCEPTION 'aceitou arrumação com menos de 9 salas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.clientes SET escritorio_layout = NULL WHERE id = cid;
END $$;
ROLLBACK;
