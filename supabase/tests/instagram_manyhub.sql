-- Regressão: conversas do Many Hub. Só o dono da conta (ou a equipe com a área) lê; o app não escreve (só o robô); a mesma mensagem da Meta não entra duas vezes.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000481','mh-dono@example.com',now()), ('10000000-0000-0000-0000-000000000482','mh-outro@example.com',now());
INSERT INTO public.instagram_conexoes(ig_user_id, user_id, username, access_token) VALUES ('900481', '10000000-0000-0000-0000-000000000481', 'conta_mh', 'segredo');
INSERT INTO public.instagram_contatos(ig_user_id, contato_id, username) VALUES ('900481', 'c1', 'maria');
INSERT INTO public.instagram_mensagens(ig_user_id, contato_id, mid, de_mim, origem, texto) VALUES ('900481', 'c1', 'm1', false, 'contato', 'quero'), ('900481', 'c1', 'm2', true, 'fluxo', 'Oi!');
DO $$
BEGIN
  BEGIN INSERT INTO public.instagram_mensagens(ig_user_id, contato_id, mid, de_mim, origem, texto) VALUES ('900481', 'c1', 'm1', false, 'contato', 'repetida'); RAISE EXCEPTION 'mid repetido aceito';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public.instagram_mensagens(ig_user_id, contato_id, de_mim, origem, texto) VALUES ('900481', 'c1', false, 'inventada', 'x'); RAISE EXCEPTION 'origem inválida aceita';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000481',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.instagram_mensagens) <> 2 THEN RAISE EXCEPTION 'dono não vê as mensagens'; END IF;
  IF (SELECT count(*) FROM public.instagram_contatos) <> 1 THEN RAISE EXCEPTION 'dono não vê o contato'; END IF;
  BEGIN INSERT INTO public.instagram_mensagens(ig_user_id, contato_id, de_mim, texto) VALUES ('900481', 'c1', true, 'app escreveu'); RAISE EXCEPTION 'app escreveu mensagem';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.instagram_contatos SET username = 'x'; RAISE EXCEPTION 'app mexeu no contato';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000482',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.instagram_mensagens) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu as conversas'; END IF;
  IF (SELECT count(*) FROM public.instagram_contatos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu os contatos'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
