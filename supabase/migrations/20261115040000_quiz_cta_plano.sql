-- Qual oferta a pessoa clicou (15/11/2026, Davi: "preciso saber em qual oferta a pessoa clicou"): o clique no botão de compra grava o plano escolhido
-- (Anual, Semestral, Trimestral…) no evento "cta". Se ela clicar em outro plano depois, vale o último.
ALTER TABLE public.quiz_eventos ADD COLUMN detalhe text;
CREATE OR REPLACE FUNCTION public.registrar_evento_quiz(p_slug text, p_sessao uuid, p_tipo text, p_passo integer DEFAULT -1, p_utm jsonb DEFAULT NULL, p_detalhe text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record;
BEGIN
  IF p_tipo NOT IN ('visita', 'passo', 'fim', 'cta') OR p_sessao IS NULL THEN RETURN; END IF;
  SELECT id, cliente_id INTO q FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado';
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO quiz_eventos (quiz_id, cliente_id, sessao, tipo, passo, utm, detalhe)
  VALUES (q.id, q.cliente_id, p_sessao, p_tipo, CASE WHEN p_tipo = 'passo' THEN least(greatest(coalesce(p_passo, 0), 0), 300) ELSE -1 END, quiz_utm_limpa(p_utm),
          CASE WHEN p_tipo = 'cta' THEN left(nullif(btrim(p_detalhe), ''), 80) END)
  ON CONFLICT (quiz_id, sessao, tipo, passo) DO UPDATE SET detalhe = EXCLUDED.detalhe WHERE quiz_eventos.tipo = 'cta' AND EXCLUDED.detalhe IS NOT NULL;
END;
$$;
-- A versão antiga (5 argumentos) sai: com as duas, a chamada sem detalhe ficaria ambígua.
DROP FUNCTION IF EXISTS public.registrar_evento_quiz(text, uuid, text, integer, jsonb);
GRANT EXECUTE ON FUNCTION public.registrar_evento_quiz(text, uuid, text, integer, jsonb, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
GRANT SELECT (detalhe) ON public.quiz_eventos TO authenticated;
