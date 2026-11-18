-- Regressão: os pixels salvos no quiz saem no quiz_publico; a versão (V2) herda os do original; a prévia não leva pixel.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000451','qpx@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000451',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000453', 'QPX', 30, 'x', '10000000-0000-0000-0000-000000000451');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura, pixels) VALUES
 ('10000000-0000-0000-0000-000000000454', '10000000-0000-0000-0000-000000000453', 'A', 'qpx-orig', 'publicado', '{"perguntas":[{"id":"q1","texto":"a","opcoes":[]}],"perfis":[]}', '{"meta":"123456789012345","tiktok":"ABC123"}');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura, variante_de, versao) VALUES
 ('10000000-0000-0000-0000-000000000455', '10000000-0000-0000-0000-000000000453', 'A v2', 'qpx-v2', 'publicado', '{"perguntas":[{"id":"q1","texto":"a","opcoes":[]}],"perfis":[]}', '10000000-0000-0000-0000-000000000454', 2);
DO $$
BEGIN
  IF public.quiz_publico('qpx-orig')->'pixels'->>'meta' <> '123456789012345' THEN RAISE EXCEPTION 'pixel do original não saiu'; END IF;
  IF public.quiz_publico('qpx-v2')->'pixels'->>'tiktok' <> 'ABC123' THEN RAISE EXCEPTION 'versão não herdou o pixel'; END IF;
  UPDATE public.quizzes SET pixels = '{"meta":"999"}' WHERE id = '10000000-0000-0000-0000-000000000455';
  IF public.quiz_publico('qpx-v2')->'pixels'->>'meta' <> '999' THEN RAISE EXCEPTION 'versão não usou o próprio pixel'; END IF;
END $$;
ROLLBACK;
