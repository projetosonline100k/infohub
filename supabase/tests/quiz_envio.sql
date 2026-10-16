-- Regressão: o Storage só aceita imagens do Roy no quiz com o token certo,
-- dentro do prazo e com o quiz criando ou em revisão; o app não lê o token.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000491','quiz-envio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000491',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000492', 'Envio quiz', 30, 'x', auth.uid());
INSERT INTO public.quizzes(id, cliente_id, titulo, slug) VALUES
 ('10000000-0000-0000-0000-000000000493', '10000000-0000-0000-0000-000000000492', 'Quiz envio', 'quiz-envio-teste');
RESET ROLE;
UPDATE public.quizzes SET status = 'revisar' WHERE id = '10000000-0000-0000-0000-000000000493';
INSERT INTO public.quiz_envios(token, quiz_id) VALUES
 ('10000000-0000-0000-0000-000000000494', '10000000-0000-0000-0000-000000000493');
INSERT INTO public.quiz_envios(token, quiz_id, expira_em) VALUES
 ('10000000-0000-0000-0000-000000000495', '10000000-0000-0000-0000-000000000493', now() - interval '1 minute');
DO $$
DECLARE base text := 'roy/10000000-0000-0000-0000-000000000493/';
BEGIN
 IF NOT public.quiz_envio_permitido(base || '10000000-0000-0000-0000-000000000494/q1.jpg') THEN
   RAISE EXCEPTION 'token certo foi recusado'; END IF;
 IF public.quiz_envio_permitido(base || '10000000-0000-0000-0000-000000000496/q1.jpg') THEN
   RAISE EXCEPTION 'token errado foi aceito'; END IF;
 IF public.quiz_envio_permitido(base || '10000000-0000-0000-0000-000000000495/q1.jpg') THEN
   RAISE EXCEPTION 'token vencido foi aceito'; END IF;
 IF public.quiz_envio_permitido(base || '10000000-0000-0000-0000-000000000494/x.svg') THEN
   RAISE EXCEPTION 'svg aceito'; END IF;
 IF public.quiz_envio_permitido('outro/10000000-0000-0000-0000-000000000493/10000000-0000-0000-0000-000000000494/q1.jpg') THEN
   RAISE EXCEPTION 'pasta fora de roy/ aceita'; END IF;
 IF public.quiz_envio_permitido(base || 'nao-e-uuid/q1.jpg') THEN RAISE EXCEPTION 'caminho inválido aceito'; END IF;
 -- Publicado/pausado aceita (ajustes pedidos no chat depois de publicar, 15/10); cancelado não.
 UPDATE public.quizzes SET status = 'pausado' WHERE id = '10000000-0000-0000-0000-000000000493';
 IF NOT public.quiz_envio_permitido(base || '10000000-0000-0000-0000-000000000494/q1.jpg') THEN
   RAISE EXCEPTION 'recusou envio com o quiz pausado'; END IF;
 UPDATE public.quizzes SET status = 'cancelado' WHERE id = '10000000-0000-0000-0000-000000000493';
 IF public.quiz_envio_permitido(base || '10000000-0000-0000-0000-000000000494/q1.jpg') THEN
   RAISE EXCEPTION 'aceitou envio com o quiz cancelado'; END IF;
 UPDATE public.quizzes SET status = 'revisar' WHERE id = '10000000-0000-0000-0000-000000000493';
END $$;
-- A policy vale pra quem tem só a chave pública (anon).
SET LOCAL ROLE anon;
INSERT INTO storage.objects(bucket_id, name) VALUES
 ('quiz-imagens', 'roy/10000000-0000-0000-0000-000000000493/10000000-0000-0000-0000-000000000494/q1.jpg');
DO $$
BEGIN
 INSERT INTO storage.objects(bucket_id, name) VALUES
  ('quiz-imagens', 'roy/10000000-0000-0000-0000-000000000493/10000000-0000-0000-0000-000000000496/q1.jpg');
 RAISE EXCEPTION 'anon enviou com token errado';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
-- O app não lê os tokens.
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 PERFORM token FROM public.quiz_envios;
 RAISE EXCEPTION 'app leu o token';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
ROLLBACK;
