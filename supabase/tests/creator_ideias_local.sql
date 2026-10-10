-- Regressão: o dono conclui a própria ideia pelo app; outra conta não.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000089','ideias-local-owner@example.com',now()),
 ('10000000-0000-0000-0000-000000000088','ideias-local-outsider@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000089',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cliente uuid; v_pasta uuid; v_ideia uuid; n int;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Teste ideias local', 30, 'x', auth.uid()) RETURNING id INTO v_cliente;
 INSERT INTO public.pastas_atividade(cliente_id, user_id, nome, origem) VALUES (v_cliente, auth.uid(), 'Mentorada', 'documentos') RETURNING id INTO v_pasta;
 INSERT INTO public.creator_ideias(pasta_id, link) VALUES (v_pasta, 'https://x/1') RETURNING id INTO v_ideia;
 UPDATE public.creator_ideias SET status = 'pronta', headline_pt = 'Gancho' WHERE id = v_ideia;
 IF NOT EXISTS (SELECT 1 FROM public.creator_ideias WHERE id = v_ideia AND status = 'pronta') THEN RAISE EXCEPTION 'dono não conseguiu concluir'; END IF;
 BEGIN
   UPDATE public.creator_ideias SET user_id = '10000000-0000-0000-0000-000000000088' WHERE id = v_ideia;
   RAISE EXCEPTION 'app trocou o dono da ideia';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000088',true);
 UPDATE public.creator_ideias SET status = 'erro' WHERE id = v_ideia;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'outra conta alterou ideia alheia'; END IF;
END $$;
ROLLBACK;
