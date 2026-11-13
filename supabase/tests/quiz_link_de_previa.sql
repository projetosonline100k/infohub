-- Regressão: a prévia mostra o rascunho (não a versão publicada), token errado não abre nada e a prévia não grava métrica.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000351','qlp@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000351',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000353', 'QLP', 30, 'x', '10000000-0000-0000-0000-000000000351');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura, estrutura_publicada) VALUES
 ('10000000-0000-0000-0000-000000000354', '10000000-0000-0000-0000-000000000353', 'Q', 'qlp-teste-1', 'publicado', '{"perguntas":[{"id":"q1","texto":"a","opcoes":[]}],"perfis":[],"v":"rascunho"}', '{"perguntas":[{"id":"q1","texto":"a","opcoes":[]}],"perfis":[],"v":"publicada"}');
DO $$
DECLARE t text; r jsonb;
BEGIN
  SELECT previa_token INTO t FROM public.quizzes WHERE id = '10000000-0000-0000-0000-000000000354';
  IF length(t) < 16 THEN RAISE EXCEPTION 'token curto: %', t; END IF;
  r := public.quiz_rascunho(t);
  IF r->'estrutura'->>'v' <> 'rascunho' THEN RAISE EXCEPTION 'prévia não mostrou o rascunho: %', r; END IF;
  r := public.quiz_publico('qlp-teste-1');
  IF r->'estrutura'->>'v' <> 'publicada' THEN RAISE EXCEPTION 'link público mudou: %', r; END IF;
  IF public.quiz_rascunho('errado') IS NOT NULL OR public.quiz_rascunho(NULL) IS NOT NULL OR public.quiz_rascunho('') IS NOT NULL THEN RAISE EXCEPTION 'token inválido abriu'; END IF;
  IF (SELECT count(*) FROM public.quiz_eventos WHERE quiz_id = '10000000-0000-0000-0000-000000000354') <> 0 THEN RAISE EXCEPTION 'prévia gravou evento'; END IF;
END $$;
ROLLBACK;
