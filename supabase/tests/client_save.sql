-- Regressão: criação com RETURNING, equipe e isolamento; fixtures descartados.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000099','client-save-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000098','client-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000099',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE new_id uuid; changed integer;
BEGIN
 INSERT INTO public.clientes(id,nome_especialista,idade,nicho,user_id)
 VALUES ('20000000-0000-0000-0000-000000000099','Teste transacional',28,'Teste',auth.uid()) RETURNING id INTO new_id;
 IF new_id IS NULL THEN RAISE EXCEPTION 'Cadastro não retornou id'; END IF;
 INSERT INTO public.equipe_cliente(cliente_id,nome_pessoa,papel) VALUES (new_id,'Teste','Coprodutor');
 UPDATE public.clientes SET meta_atual='Teste de edição' WHERE id=new_id;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Proprietário não conseguiu editar'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000098',true);
DO $$
DECLARE changed integer;
BEGIN
 IF EXISTS (SELECT 1 FROM public.clientes WHERE id='20000000-0000-0000-0000-000000000099') THEN RAISE EXCEPTION 'Outra conta leu cliente privado'; END IF;
 UPDATE public.clientes SET meta_atual='Não autorizado' WHERE id='20000000-0000-0000-0000-000000000099';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta editou cliente privado'; END IF;
 DELETE FROM public.clientes WHERE id='20000000-0000-0000-0000-000000000099';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta excluiu cliente privado'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
