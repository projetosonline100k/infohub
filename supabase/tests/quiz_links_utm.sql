-- Regressão: trocar o endereço do quiz mantém o antigo funcionando; endereço em uso é recusado; a UTM entra limpa na
-- visita e no lead; link nomeado é do dono.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000321','qlu@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000321',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000323', 'QLU', 30, 'x', '10000000-0000-0000-0000-000000000321');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES
 ('10000000-0000-0000-0000-000000000324', '10000000-0000-0000-0000-000000000323', 'A', 'qlu-antigo', 'publicado', '{"perguntas":[{"id":"q1","texto":"v1","opcoes":[]}],"perfis":[]}'),
 ('10000000-0000-0000-0000-000000000325', '10000000-0000-0000-0000-000000000323', 'B', 'qlu-outro', 'publicado', '{"perguntas":[{"id":"q1","texto":"x","opcoes":[]}],"perfis":[]}');
DO $$
BEGIN
  UPDATE public.quizzes SET slug = 'qlu-novo' WHERE id = '10000000-0000-0000-0000-000000000324';
  IF public.quiz_publico('qlu-novo') IS NULL OR public.quiz_publico('qlu-antigo') IS NULL THEN RAISE EXCEPTION 'link novo ou antigo não abre'; END IF;
  BEGIN
    UPDATE public.quizzes SET slug = 'qlu-outro' WHERE id = '10000000-0000-0000-0000-000000000324';
    RAISE EXCEPTION 'aceitou endereço em uso';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'esse endereço%' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.quizzes SET slug = 'qlu-antigo' WHERE id = '10000000-0000-0000-0000-000000000325';
    RAISE EXCEPTION 'aceitou endereço antigo de outro quiz';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'esse endereço%' THEN RAISE; END IF; END;
  -- voltar ao endereço antigo do próprio quiz é permitido
  UPDATE public.quizzes SET slug = 'qlu-antigo' WHERE id = '10000000-0000-0000-0000-000000000324';
  IF NOT (SELECT 'qlu-novo' = ANY (slugs_antigos) AND NOT 'qlu-antigo' = ANY (slugs_antigos) FROM public.quizzes WHERE id = '10000000-0000-0000-0000-000000000324') THEN RAISE EXCEPTION 'lista de antigos errada'; END IF;

  PERFORM public.registrar_evento_quiz('qlu-novo', '10000000-0000-0000-0000-0000000000a1', 'visita', -1, '{"utm_source":"instagram","utm_campaign":"bio","x":"lixo","utm_medium":""}');
  IF (SELECT utm FROM public.quiz_eventos WHERE sessao = '10000000-0000-0000-0000-0000000000a1') <> '{"utm_source":"instagram","utm_campaign":"bio"}'::jsonb THEN RAISE EXCEPTION 'utm não ficou limpa: %', (SELECT utm FROM public.quiz_eventos LIMIT 1); END IF;
  PERFORM public.responder_quiz('qlu-antigo', '[]', 'p', 'Ana', 'a@b.co', '11', '{"utm_source":"instagram"}');
  IF (SELECT utm->>'utm_source' FROM public.quiz_respostas WHERE nome = 'Ana') <> 'instagram' THEN RAISE EXCEPTION 'lead sem utm'; END IF;
  PERFORM public.responder_quiz('qlu-antigo', '[]', 'p', 'Bia', NULL, NULL);
  IF (SELECT utm FROM public.quiz_respostas WHERE nome = 'Bia') IS NOT NULL THEN RAISE EXCEPTION 'utm vazia deveria ser nula'; END IF;
END $$;
SET LOCAL ROLE authenticated;
INSERT INTO public.quiz_links(quiz_id, cliente_id, nome, utm_source, utm_medium) VALUES ('10000000-0000-0000-0000-000000000324', '10000000-0000-0000-0000-000000000323', 'Bio do Instagram', 'instagram', 'bio');
DO $$ BEGIN IF (SELECT count(*) FROM public.quiz_links) <> 1 THEN RAISE EXCEPTION 'dono não vê o link'; END IF; END $$;
RESET ROLE;
ROLLBACK;
