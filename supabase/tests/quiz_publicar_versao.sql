-- Regressão: no quiz publicado, editar não muda o link; Publicar (copiar para estrutura_publicada) muda; em teste o link mostra a edição.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000291','qpv@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000291',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000293', 'QPV', 30, 'x', '10000000-0000-0000-0000-000000000291');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES
 ('10000000-0000-0000-0000-000000000294', '10000000-0000-0000-0000-000000000293', 'Q', 'qpv-teste-1', 'revisar', '{"perguntas":[{"id":"q1","texto":"v1","opcoes":[]}],"perfis":[]}');
DO $$
DECLARE r jsonb;
BEGIN
  IF public.quiz_publico('qpv-teste-1')->'estrutura'->'perguntas'->0->>'texto' <> 'v1' THEN RAISE EXCEPTION 'teste não mostra a edição'; END IF;
  UPDATE public.quizzes SET estrutura = '{"perguntas":[{"id":"q1","texto":"v2","opcoes":[]}],"perfis":[]}' WHERE id = '10000000-0000-0000-0000-000000000294';
  IF public.quiz_publico('qpv-teste-1')->'estrutura'->'perguntas'->0->>'texto' <> 'v2' THEN RAISE EXCEPTION 'teste não acompanha a edição'; END IF;
  UPDATE public.quizzes SET status = 'publicado' WHERE id = '10000000-0000-0000-0000-000000000294';
  IF (SELECT estrutura_publicada->'perguntas'->0->>'texto' FROM public.quizzes WHERE id = '10000000-0000-0000-0000-000000000294') <> 'v2' THEN RAISE EXCEPTION 'publicar não copiou'; END IF;
  UPDATE public.quizzes SET estrutura = '{"perguntas":[{"id":"q1","texto":"v3","opcoes":[]}],"perfis":[]}' WHERE id = '10000000-0000-0000-0000-000000000294';
  IF public.quiz_publico('qpv-teste-1')->'estrutura'->'perguntas'->0->>'texto' <> 'v2' THEN RAISE EXCEPTION 'edição vazou para o link publicado'; END IF;
  UPDATE public.quizzes SET estrutura_publicada = estrutura WHERE id = '10000000-0000-0000-0000-000000000294';
  IF public.quiz_publico('qpv-teste-1')->'estrutura'->'perguntas'->0->>'texto' <> 'v3' THEN RAISE EXCEPTION 'Publicar não levou a edição ao ar'; END IF;
  -- pausar e publicar de novo mantém a versão que estava no ar
  UPDATE public.quizzes SET status = 'pausado' WHERE id = '10000000-0000-0000-0000-000000000294';
  UPDATE public.quizzes SET estrutura = '{"perguntas":[{"id":"q1","texto":"v4","opcoes":[]}],"perfis":[]}', status = 'publicado' WHERE id = '10000000-0000-0000-0000-000000000294';
  IF public.quiz_publico('qpv-teste-1')->'estrutura'->'perguntas'->0->>'texto' <> 'v3' THEN RAISE EXCEPTION 'republicar trocou a versão sem Publicar'; END IF;
END $$;
ROLLBACK;
