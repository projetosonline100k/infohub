-- Regressão: o dono registra a abordagem e o modelo; abordagem de lead de outro quiz é recusada; abordagem não se edita; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000351','x1-dono@example.com',now()), ('10000000-0000-0000-0000-000000000352','x1-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000351',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000353', 'X1', 30, 'x', '10000000-0000-0000-0000-000000000351');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES
 ('10000000-0000-0000-0000-000000000354', '10000000-0000-0000-0000-000000000353', 'A', 'x1-teste-a', 'revisar', '{"perguntas":[],"perfis":[]}'),
 ('10000000-0000-0000-0000-000000000355', '10000000-0000-0000-0000-000000000353', 'B', 'x1-teste-b', 'revisar', '{"perguntas":[],"perfis":[]}');
INSERT INTO public.quiz_respostas(id, quiz_id, cliente_id, nome, whatsapp) VALUES ('10000000-0000-0000-0000-000000000356', '10000000-0000-0000-0000-000000000354', '10000000-0000-0000-0000-000000000353', 'Ana', '11999');
SET LOCAL ROLE authenticated;
INSERT INTO public.quiz_abordagens(quiz_id, resposta_id, cliente_id, texto, modelo) VALUES ('10000000-0000-0000-0000-000000000354', '10000000-0000-0000-0000-000000000356', '10000000-0000-0000-0000-000000000353', 'Oi Ana!', 'Boas-vindas');
INSERT INTO public.quiz_modelos_abordagem(cliente_id, nome, texto) VALUES ('10000000-0000-0000-0000-000000000353', 'Meu modelo', 'Oi {nome}');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.quiz_abordagens(quiz_id, resposta_id, cliente_id, texto) VALUES ('10000000-0000-0000-0000-000000000355', '10000000-0000-0000-0000-000000000356', '10000000-0000-0000-0000-000000000353', 'x');
    RAISE EXCEPTION 'aceitou lead de outro quiz';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'lead não é deste quiz' THEN RAISE; END IF; END;
  BEGIN UPDATE public.quiz_abordagens SET texto = 'editada'; RAISE EXCEPTION 'editou abordagem';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.quiz_abordagens(quiz_id, resposta_id, cliente_id, texto) VALUES ('10000000-0000-0000-0000-000000000354', '10000000-0000-0000-0000-000000000356', '10000000-0000-0000-0000-000000000353', '   ');
    RAISE EXCEPTION 'aceitou texto vazio';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000352',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.quiz_abordagens) + (SELECT count(*) FROM public.quiz_modelos_abordagem) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu'; END IF; END $$;
RESET ROLE;
ROLLBACK;
