-- Regressão: uma regra só para o Instagram da Dalila. Projeto sem conexão
-- própria não herda a conta geral (só o Davi Queiroz herda); a tela vê o @
-- só do projeto a que tem acesso; o app não chama a função da nuvem.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000991','dru-dono@example.com',now()),
 ('10000000-0000-0000-0000-000000000992','dru-alheio@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000991',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000993', 'Sem Insta', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000994', 'Com Insta', 30, 'x', auth.uid());
RESET ROLE;
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token) VALUES
 ('10000000-0000-0000-0000-000000000991', NULL, 'dru-g', 'conta_geral', 'x'),
 ('10000000-0000-0000-0000-000000000991', '10000000-0000-0000-0000-000000000994', 'dru-p', 'do_projeto', 'x');
DO $$ BEGIN
 IF public.dalila_conexao_do_projeto('10000000-0000-0000-0000-000000000993') IS NOT NULL THEN
   RAISE EXCEPTION 'projeto sem Instagram herdou a conta geral'; END IF;
 IF public.dalila_conexao_do_projeto('10000000-0000-0000-0000-000000000994') <> 'dru-p' THEN
   RAISE EXCEPTION 'não usou o Instagram do projeto'; END IF;
 IF public.dalila_conexao_do_projeto('e4b24f93-0eda-43fc-b50e-3ebe24f8905f') <> '17841439728505829' THEN
   RAISE EXCEPTION 'Davi Queiroz perdeu o @eu.davioficial'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000991',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.instagram_do_projeto('10000000-0000-0000-0000-000000000994') IS DISTINCT FROM 'do_projeto' THEN RAISE EXCEPTION 'dono não viu o @'; END IF;
 IF public.instagram_do_projeto('10000000-0000-0000-0000-000000000993') IS NOT NULL THEN RAISE EXCEPTION 'tela mostrou @ errado'; END IF;
 BEGIN
   PERFORM public.dalila_conexao_do_projeto('10000000-0000-0000-0000-000000000994');
   RAISE EXCEPTION 'app chamou a função da nuvem';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000992',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.instagram_do_projeto('10000000-0000-0000-0000-000000000994') IS NOT NULL THEN RAISE EXCEPTION 'alheio viu o @'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
