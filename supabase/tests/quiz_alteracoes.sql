-- Histórico de alterações do quiz: publicar uma mudança grava o que mudou; sem mudança não grava; cada dono vê só o seu.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000d01','qa1@example.com',now()),('10000000-0000-0000-0000-000000000d02','qa2@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000d01',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000d11', 'QA1', 30, 'x', '10000000-0000-0000-0000-000000000d01');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES ('10000000-0000-0000-0000-000000000d21', '10000000-0000-0000-0000-000000000d11', 'Q', 'qa-q', 'publicado', '{"perguntas":[{"id":"a","texto":"x"}],"telas":[]}');
DO $$
BEGIN
  UPDATE public.quizzes SET estrutura_publicada = '{"perguntas":[{"id":"a","texto":"x"}],"telas":[{"id":"t1"}]}' WHERE id = '10000000-0000-0000-0000-000000000d21';
  IF (SELECT count(*) FROM public.quiz_alteracoes WHERE quiz_id = '10000000-0000-0000-0000-000000000d21') <> 1 THEN RAISE EXCEPTION 'mudança publicada não registrada'; END IF;
  IF (SELECT resumo FROM public.quiz_alteracoes WHERE quiz_id = '10000000-0000-0000-0000-000000000d21') NOT LIKE '%tela nova: t1%' THEN RAISE EXCEPTION 'resumo não cita a tela nova'; END IF;
  UPDATE public.quizzes SET estrutura_publicada = '{"perguntas":[{"id":"a","texto":"x"}],"telas":[{"id":"t1"}]}', titulo = 'Q2' WHERE id = '10000000-0000-0000-0000-000000000d21';
  IF (SELECT count(*) FROM public.quiz_alteracoes WHERE quiz_id = '10000000-0000-0000-0000-000000000d21') <> 1 THEN RAISE EXCEPTION 'registrou mudança que não houve'; END IF;
  UPDATE public.quizzes SET estrutura_publicada = '{"perguntas":[{"id":"a","texto":"y"}],"telas":[{"id":"t1"}]}' WHERE id = '10000000-0000-0000-0000-000000000d21';
  IF (SELECT count(*) FROM public.quiz_alteracoes WHERE quiz_id = '10000000-0000-0000-0000-000000000d21' AND resumo LIKE '%pergunta a%') <> 1 THEN RAISE EXCEPTION 'resumo não cita a pergunta alterada'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.quiz_alteracoes) <> 2 THEN RAISE EXCEPTION 'dono não vê as próprias alterações'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000d02',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.quiz_alteracoes) <> 0 THEN RAISE EXCEPTION 'outro dono enxerga alterações alheias'; END IF;
END $$;
ROLLBACK;
