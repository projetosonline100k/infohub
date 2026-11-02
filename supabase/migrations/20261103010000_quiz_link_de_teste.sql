-- 03/11 (Davi: "preciso de um link de teste para testar no meu celular"): o link do quiz também abre enquanto ele
-- está "revisar" (pronto para testar), antes de publicar. Resposta e visita continuam só em quiz publicado
-- (responder_quiz e registrar_evento_quiz não mudam): os testes não entram nas métricas nem viram lead.
CREATE OR REPLACE FUNCTION public.quiz_publico(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('titulo', titulo, 'estrutura', estrutura)
    FROM quizzes WHERE slug = p_slug AND status IN ('revisar', 'publicado');
$$;
