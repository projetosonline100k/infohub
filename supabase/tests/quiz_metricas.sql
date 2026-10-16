-- Regressão: métricas do quiz. Evento só entra pelo RPC e só com o quiz
-- publicado; a mesma sessão não conta duas vezes; outra conta não vê; anon
-- não lê a tabela.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000691','qm-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000692','qm-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000691',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000693', 'QM', 30, 'x', auth.uid());
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES
 ('10000000-0000-0000-0000-000000000694', '10000000-0000-0000-0000-000000000693', 'Q', 'qm-teste', 'publicado',
  '{"perguntas":[{"id":"q1","texto":"?","opcoes":[{"texto":"a"},{"texto":"b"}]}],"perfis":[{"id":"p","nome":"P"}]}');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status) VALUES
 ('10000000-0000-0000-0000-000000000695', '10000000-0000-0000-0000-000000000693', 'Rascunho', 'qm-rascunho', 'esboco');

DO $$
BEGIN
  INSERT INTO public.quiz_eventos(quiz_id, cliente_id, sessao, tipo) VALUES
   ('10000000-0000-0000-0000-000000000694', '10000000-0000-0000-0000-000000000693', gen_random_uuid(), 'visita');
  RAISE EXCEPTION 'inseriu evento direto';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE s uuid := '10000000-0000-0000-0000-000000000696';
BEGIN
  PERFORM public.registrar_evento_quiz('qm-teste', s, 'visita');
  PERFORM public.registrar_evento_quiz('qm-teste', s, 'visita');       -- recarregou: não duplica
  PERFORM public.registrar_evento_quiz('qm-teste', s, 'passo', 1);
  PERFORM public.registrar_evento_quiz('qm-teste', s, 'passo', 2);
  PERFORM public.registrar_evento_quiz('qm-teste', s, 'cta');
  PERFORM public.registrar_evento_quiz('qm-teste', s, 'hackear');      -- tipo inválido: ignora
  PERFORM public.registrar_evento_quiz('qm-rascunho', s, 'visita');    -- não publicado: ignora
  BEGIN
    PERFORM 1 FROM public.quiz_eventos;
    RAISE EXCEPTION 'anon leu a tabela';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000691',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.quiz_eventos WHERE quiz_id = '10000000-0000-0000-0000-000000000694') <> 4 THEN
    RAISE EXCEPTION 'esperava 4 eventos (visita, 2 passos, cta), veio %', (SELECT count(*) FROM public.quiz_eventos WHERE quiz_id = '10000000-0000-0000-0000-000000000694'); END IF;
  IF EXISTS (SELECT 1 FROM public.quiz_eventos WHERE quiz_id = '10000000-0000-0000-0000-000000000695') THEN RAISE EXCEPTION 'contou quiz não publicado'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000692',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.quiz_eventos) THEN RAISE EXCEPTION 'outra conta viu as métricas'; END IF;
END $$;
ROLLBACK;
