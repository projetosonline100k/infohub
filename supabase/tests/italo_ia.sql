-- O Ítalo virou IA, continua ativo no Marketing e com as mesmas responsabilidades.
BEGIN;
DO $$
DECLARE m public.membros;
BEGIN
  SELECT * INTO m FROM public.membros WHERE id = 'fd0bb07d-7c87-49ca-ac02-627f06f65406';
  IF NOT m.eh_ia THEN RAISE EXCEPTION 'Ítalo não virou IA'; END IF;
  IF NOT m.ativo THEN RAISE EXCEPTION 'Ítalo inativo'; END IF;
  IF m.funcao <> 'Copywriter (IA)' THEN RAISE EXCEPTION 'função errada: %', m.funcao; END IF;
  IF NOT ('copy de VSL' = ANY(m.responsabilidades)) THEN RAISE EXCEPTION 'responsabilidades mudaram'; END IF;
END $$;
ROLLBACK;
