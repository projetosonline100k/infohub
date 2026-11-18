-- Regressão: o evento "amostra" grava o detalhe (o último vale) e a V2 do Instalivros tem a tela "amostra_livro" com o plano dentro (sem a tela "livros_plano"); a V1 não.
BEGIN;
DO $$
DECLARE qid uuid; sess uuid := gen_random_uuid(); d text; qtd int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7') THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.quizzes q, jsonb_array_elements(q.estrutura->'telas') t WHERE q.id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7' AND t->>'id' = 'livros_plano') THEN
    RAISE EXCEPTION 'a V2 não tem mais a tela livros_plano (o plano vive na amostra_livro)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quizzes q, jsonb_array_elements(q.estrutura->'telas') t WHERE q.id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7' AND t->>'id' = 'amostra_livro' AND t->'plano' ? 'total_dias' AND t->'plano' ? 'livros_temas') THEN
    RAISE EXCEPTION 'a tela amostra_livro da V2 precisa carregar a configuração do plano';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quizzes q, jsonb_array_elements(q.estrutura->'telas') t WHERE q.id::text LIKE 'dccceb2d%' AND t->>'tipo' = 'amostra') THEN
    RAISE EXCEPTION 'a V1 não tem tela de amostra';
  END IF;
  SELECT id INTO qid FROM public.quizzes WHERE status = 'publicado' AND slug IS NOT NULL LIMIT 1;
  IF qid IS NULL THEN RETURN; END IF;
  PERFORM public.registrar_evento_quiz((SELECT slug FROM public.quizzes WHERE id = qid), sess, 'amostra', -1, NULL, 'abriu');
  PERFORM public.registrar_evento_quiz((SELECT slug FROM public.quizzes WHERE id = qid), sess, 'amostra', -1, NULL, 'ouviu=42s;total=75s;fim=nao');
  SELECT count(*), max(detalhe) INTO qtd, d FROM public.quiz_eventos WHERE quiz_id = qid AND sessao = sess AND tipo = 'amostra';
  IF qtd <> 1 OR d <> 'ouviu=42s;total=75s;fim=nao' THEN RAISE EXCEPTION 'evento amostra: esperava 1 linha com o último detalhe, veio % / %', qtd, d; END IF;
END $$;
ROLLBACK;
