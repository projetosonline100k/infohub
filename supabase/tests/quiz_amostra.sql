-- Regressão: o evento "amostra" grava o detalhe (o último vale) e a V2 do Instalivros tem a tela "amostra_livro" logo depois de "livros_plano"; a V1 não.
BEGIN;
DO $$
DECLARE qid uuid; sess uuid := gen_random_uuid(); d text; qtd int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7') THEN RETURN; END IF;
  IF (SELECT t->>'id' FROM public.quizzes q, jsonb_array_elements(q.estrutura->'telas') WITH ORDINALITY a(t, i)
       WHERE q.id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7' AND i = (SELECT b.i + 1 FROM public.quizzes q2, jsonb_array_elements(q2.estrutura->'telas') WITH ORDINALITY b(t, i) WHERE q2.id = q.id AND t->>'id' = 'livros_plano')) IS DISTINCT FROM 'amostra_livro' THEN
    RAISE EXCEPTION 'a tela amostra_livro deveria vir logo depois de livros_plano na V2';
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
