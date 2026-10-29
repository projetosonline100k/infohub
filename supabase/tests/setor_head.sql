-- Head do setor (20261029010000): o dono escolhe o head; outra conta não mexe; apagar o membro limpa o head.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000071','head-dono@example.com',now()),
 ('10000000-0000-0000-0000-000000000072','head-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000071',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cli uuid; v_setor uuid; v_dalila uuid; n int;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Teste head', 30, 'x', auth.uid()) RETURNING id INTO v_cli;
 INSERT INTO public.setores(cliente_id, nome) VALUES (v_cli, 'Audiovisual') RETURNING id INTO v_setor;
 INSERT INTO public.membros(cliente_id, setor_id, nome) VALUES (v_cli, v_setor, 'Dalila') RETURNING id INTO v_dalila;

 UPDATE public.setores SET head_id = v_dalila WHERE id = v_setor;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'dono não conseguiu escolher o head'; END IF;

 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000072',true);
 UPDATE public.setores SET head_id = NULL WHERE id = v_setor;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'outra conta mexeu no head'; END IF;

 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000071',true);
 DELETE FROM public.membros WHERE id = v_dalila;
 IF (SELECT head_id FROM public.setores WHERE id = v_setor) IS NOT NULL THEN RAISE EXCEPTION 'apagar o membro não limpou o head'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
