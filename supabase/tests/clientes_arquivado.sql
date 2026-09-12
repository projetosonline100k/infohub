-- Regressão: arquivar/desarquivar cliente, isolamento entre contas.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000095','arquivo-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000094','arquivo-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000095',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_cliente uuid; changed integer;
BEGIN
 INSERT INTO public.clientes(nome_especialista,idade,nicho,user_id)
 VALUES ('Teste arquivo',30,'Teste',auth.uid()) RETURNING id INTO v_cliente;

 IF EXISTS (SELECT 1 FROM public.clientes WHERE id = v_cliente AND arquivado <> false) THEN
   RAISE EXCEPTION 'Cliente novo não nasceu desarquivado';
 END IF;

 UPDATE public.clientes SET arquivado = true WHERE id = v_cliente;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Não conseguiu arquivar'; END IF;

 UPDATE public.clientes SET arquivado = false WHERE id = v_cliente;
 IF EXISTS (SELECT 1 FROM public.clientes WHERE id = v_cliente AND arquivado = true) THEN
   RAISE EXCEPTION 'Não conseguiu desarquivar';
 END IF;
END $$;

-- Isolamento: outra conta não arquiva cliente de terceiro.
DO $$
DECLARE v_cliente uuid; changed integer;
BEGIN
 SELECT id INTO v_cliente FROM public.clientes WHERE nome_especialista = 'Teste arquivo';
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000094',true);
 UPDATE public.clientes SET arquivado = true WHERE id = v_cliente;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta conseguiu arquivar cliente alheio'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
