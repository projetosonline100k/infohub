-- Regressão: o dono cria perfis do zero na esteira dark, edita o estilo, não repete nome; outra pessoa não vê nem mexe.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000411','ed-dono@example.com',now()), ('10000000-0000-0000-0000-000000000412','ed-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000411',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.esteira_dark_perfis(nome, arroba, estilo) VALUES ('Perfil Novo', '@novo', '{"gancho":"pergunta forte"}');
DO $$
BEGIN
  IF (SELECT user_id FROM public.esteira_dark_perfis) <> '10000000-0000-0000-0000-000000000411' THEN RAISE EXCEPTION 'dono não foi carimbado'; END IF;
  UPDATE public.esteira_dark_perfis SET estilo = '{"gancho":"outro"}', atualizado_em = now();
  IF (SELECT estilo->>'gancho' FROM public.esteira_dark_perfis) <> 'outro' THEN RAISE EXCEPTION 'não salvou o estilo'; END IF;
  BEGIN INSERT INTO public.esteira_dark_perfis(nome) VALUES (' perfil NOVO '); RAISE EXCEPTION 'nome repetido';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public.esteira_dark_perfis(nome) VALUES ('   '); RAISE EXCEPTION 'nome vazio';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000412',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.esteira_dark_perfis) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu o perfil'; END IF;
  DELETE FROM public.esteira_dark_perfis;
  UPDATE public.esteira_dark_perfis SET nome = 'invadido';
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT nome FROM public.esteira_dark_perfis) <> 'Perfil Novo' THEN RAISE EXCEPTION 'outra pessoa mexeu no perfil'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000411',true);
SET LOCAL ROLE authenticated;
DELETE FROM public.esteira_dark_perfis;
DO $$ BEGIN IF (SELECT count(*) FROM public.esteira_dark_perfis) <> 0 THEN RAISE EXCEPTION 'dono não apagou'; END IF; END $$;
RESET ROLE;
ROLLBACK;
