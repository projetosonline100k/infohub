-- Regressão: versões do quiz (A/B). Versão é de quiz original do mesmo projeto; o sorteio só junta versões publicadas e marcadas.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000481','ab-dono@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000481',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000482', 'Projeto AB', 30, 'x', '10000000-0000-0000-0000-000000000481');
INSERT INTO public.quizzes(id, cliente_id, user_id, titulo, slug, status, estrutura) VALUES ('10000000-0000-0000-0000-000000000483', '10000000-0000-0000-0000-000000000482', '10000000-0000-0000-0000-000000000481', 'Quiz AB', 'quiz-ab-v1', 'publicado', '{"perguntas":[{"id":"q1"}]}');
INSERT INTO public.quizzes(id, cliente_id, user_id, titulo, slug, status, estrutura, variante_de, versao) VALUES ('10000000-0000-0000-0000-000000000484', '10000000-0000-0000-0000-000000000482', '10000000-0000-0000-0000-000000000481', 'V2', 'quiz-ab-v2', 'publicado', '{"perguntas":[{"id":"q1"}]}', '10000000-0000-0000-0000-000000000483', 2);
DO $$
BEGIN
  IF coalesce(array_length(public.quiz_ab_slugs('quiz-ab-v1'), 1), 0) <> 0 THEN RAISE EXCEPTION 'sorteio sem versão marcada deveria estar vazio'; END IF;
  UPDATE public.quizzes SET ab_ativo = true WHERE id = '10000000-0000-0000-0000-000000000484';
  IF public.quiz_ab_slugs('quiz-ab-v1') <> ARRAY['quiz-ab-v1','quiz-ab-v2'] THEN RAISE EXCEPTION 'sorteio deveria juntar V1 e V2'; END IF;
  IF coalesce(array_length(public.quiz_ab_slugs('quiz-ab-v2'), 1), 0) <> 0 THEN RAISE EXCEPTION 'só o link do original sorteia'; END IF;
  BEGIN INSERT INTO public.quizzes(cliente_id, user_id, titulo, slug, status, estrutura, variante_de, versao) VALUES ('10000000-0000-0000-0000-000000000482', '10000000-0000-0000-0000-000000000481', 'V3 de V2', 'quiz-ab-v3', 'rascunho', '{}', '10000000-0000-0000-0000-000000000484', 3);
  EXCEPTION WHEN raise_exception OR check_violation THEN NULL; END;
  UPDATE public.quizzes SET status = 'pausado' WHERE id = '10000000-0000-0000-0000-000000000484';
END $$;
RESET ROLE;
DO $$
BEGIN
  IF coalesce(array_length(public.quiz_ab_slugs('quiz-ab-v1'), 1), 0) <> 0 THEN RAISE EXCEPTION 'versão pausada não deveria entrar no sorteio'; END IF;
END $$;
ROLLBACK;
