-- Conversão do quiz (12/11/2026, Davi: "quando clicar em comprar, mostrar se comprou, quantos clicaram no checkout…"): o lead guarda a sessão
-- da visita, e assim dá para saber se ESSE lead clicou no checkout (evento 'cta' da mesma sessão). A compra vem do e-mail do lead.
ALTER TABLE public.quiz_respostas ADD COLUMN sessao uuid;
CREATE INDEX quiz_respostas_sessao_idx ON public.quiz_respostas (quiz_id, sessao) WHERE sessao IS NOT NULL;

DROP FUNCTION public.responder_quiz(text, jsonb, text, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.responder_quiz(p_slug text, p_respostas jsonb, p_perfil text, p_nome text, p_email text, p_whatsapp text, p_utm jsonb DEFAULT NULL, p_sessao uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT id, cliente_id INTO q FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado';
  IF NOT FOUND THEN RAISE EXCEPTION 'quiz não encontrado'; END IF;
  IF jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_respostas, '[]'::jsonb)) > 100
     OR length(coalesce(p_respostas::text, '')) > 20000 THEN
    RAISE EXCEPTION 'respostas inválidas';
  END IF;
  INSERT INTO quiz_respostas (quiz_id, cliente_id, respostas, perfil, nome, email, whatsapp, utm, sessao)
  VALUES (q.id, q.cliente_id, coalesce(p_respostas, '[]'::jsonb), left(nullif(btrim(p_perfil), ''), 80),
          left(nullif(btrim(p_nome), ''), 120), left(nullif(btrim(p_email), ''), 200), left(nullif(btrim(p_whatsapp), ''), 40), quiz_utm_limpa(p_utm), p_sessao);
END;
$$;
REVOKE ALL ON FUNCTION public.responder_quiz(text, jsonb, text, text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.responder_quiz(text, jsonb, text, text, text, text, jsonb, uuid) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
