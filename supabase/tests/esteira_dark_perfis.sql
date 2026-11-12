-- Regressão: o dono cadastra e tira projetos da esteira dark (um registro por projeto); outra pessoa não vê nem mexe.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000411','ed-dono@example.com',now()), ('10000000-0000-0000-0000-000000000412','ed-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000411',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000413', 'ED', 30, 'x', '10000000-0000-0000-0000-000000000411');
SET LOCAL ROLE authenticated;
INSERT INTO public.esteira_dark_perfis(cliente_id) VALUES ('10000000-0000-0000-0000-000000000413');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.esteira_dark_perfis) <> 1 THEN RAISE EXCEPTION 'dono não viu o perfil'; END IF;
  BEGIN INSERT INTO public.esteira_dark_perfis(cliente_id) VALUES ('10000000-0000-0000-0000-000000000413'); RAISE EXCEPTION 'perfil duplicado';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000412',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.esteira_dark_perfis) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu o perfil'; END IF;
  DELETE FROM public.esteira_dark_perfis;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.esteira_dark_perfis) <> 1 THEN RAISE EXCEPTION 'outra pessoa apagou o perfil'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000411',true);
SET LOCAL ROLE authenticated;
DELETE FROM public.esteira_dark_perfis WHERE cliente_id = '10000000-0000-0000-0000-000000000413';
DO $$ BEGIN IF (SELECT count(*) FROM public.esteira_dark_perfis) <> 0 THEN RAISE EXCEPTION 'dono não tirou o perfil'; END IF; END $$;
RESET ROLE;
ROLLBACK;
