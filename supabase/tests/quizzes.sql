-- Regressão: quizzes. O dono cria e vê; outra conta não vê; anon não lê a
-- tabela, só o quiz publicado pelo RPC; resposta só entra com o quiz
-- publicado e pelo RPC; não publica sem perguntas; tarefa de outro projeto é recusada.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000391','quiz-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000392','quiz-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000391',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000393', 'Quiz A', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000394', 'Quiz B', 30, 'x', auth.uid());
INSERT INTO public.atividades(id, cliente_id, titulo, user_id) VALUES
 ('10000000-0000-0000-0000-000000000395', '10000000-0000-0000-0000-000000000394', 'Outra', auth.uid());
INSERT INTO public.quizzes(id, cliente_id, titulo, slug) VALUES
 ('10000000-0000-0000-0000-000000000396', '10000000-0000-0000-0000-000000000393', 'Exame da Presença', 'exame-teste');

DO $$
BEGIN
  IF (SELECT user_id FROM public.quizzes WHERE id = '10000000-0000-0000-0000-000000000396') <> auth.uid() THEN RAISE EXCEPTION 'dono não carimbado'; END IF;
  IF public.quiz_publico('exame-teste') IS NOT NULL THEN RAISE EXCEPTION 'quiz em esboço apareceu como público'; END IF;
END $$;

DO $$
BEGIN
  UPDATE public.quizzes SET status = 'publicado' WHERE id = '10000000-0000-0000-0000-000000000396';
  RAISE EXCEPTION 'publicou sem perguntas';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'quiz sem perguntas não pode ser publicado' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.quizzes(cliente_id, titulo, atividade_id) VALUES
   ('10000000-0000-0000-0000-000000000393', 'X', '10000000-0000-0000-0000-000000000395');
  RAISE EXCEPTION 'aceitou tarefa de outro projeto';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'tarefa não é deste projeto' THEN RAISE; END IF;
END $$;

-- Resposta antes de publicar: recusada.
DO $$
BEGIN
  PERFORM public.responder_quiz('exame-teste', '[]'::jsonb, 'p1', 'Ana', NULL, NULL);
  RAISE EXCEPTION 'respondeu quiz não publicado';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'quiz não encontrado' THEN RAISE; END IF;
END $$;

UPDATE public.quizzes SET status = 'publicado',
  estrutura = '{"perguntas":[{"id":"q1","texto":"?","opcoes":[{"texto":"a","perfil":"p1","pontos":1}]}],"perfis":[{"id":"p1","nome":"P"}]}'
 WHERE id = '10000000-0000-0000-0000-000000000396';

-- O app não insere resposta direto (só pelo RPC).
DO $$
BEGIN
  INSERT INTO public.quiz_respostas(quiz_id, cliente_id) VALUES ('10000000-0000-0000-0000-000000000396', '10000000-0000-0000-0000-000000000393');
  RAISE EXCEPTION 'inseriu resposta direto';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- Outra conta não vê o quiz.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000392',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.quizzes WHERE id = '10000000-0000-0000-0000-000000000396') THEN RAISE EXCEPTION 'outra conta viu o quiz'; END IF;
END $$;

-- Anônimo: não lê a tabela, lê o publicado pelo RPC e responde.
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.quizzes;
    RAISE EXCEPTION 'anon leu a tabela';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.quiz_publico('exame-teste')->>'titulo' <> 'Exame da Presença' THEN RAISE EXCEPTION 'quiz publicado não apareceu'; END IF;
  PERFORM public.responder_quiz('exame-teste', '[{"pergunta":"q1","opcao":0}]'::jsonb, 'p1', 'Ana', 'ana@example.com', '11999999999');
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.quiz_respostas WHERE quiz_id = '10000000-0000-0000-0000-000000000396') <> 1 THEN RAISE EXCEPTION 'resposta não entrou'; END IF;
END $$;
ROLLBACK;
