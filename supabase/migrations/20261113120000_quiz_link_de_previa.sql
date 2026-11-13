-- 13/11/2026 (Davi: "um link que eu abro no celular e vejo as alterações sem precisar publicar"): cada quiz ganha um
-- link de PRÉVIA secreto que sempre mostra o rascunho (quizzes.estrutura), mesmo com o quiz publicado.
-- Só lê: quiz_rascunho não grava visita, passo, resposta nem lead (responder_quiz e registrar_evento_quiz seguem só no link público).
ALTER TABLE public.quizzes ADD COLUMN previa_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX quizzes_previa_token_idx ON public.quizzes (previa_token);

CREATE OR REPLACE FUNCTION public.quiz_rascunho(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('titulo', titulo, 'estrutura', estrutura)
    FROM quizzes WHERE length(coalesce(p_token, '')) >= 16 AND previa_token = p_token AND estrutura IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.quiz_rascunho(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_rascunho(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
