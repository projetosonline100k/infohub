-- Respostas que vêm DEPOIS do contato (23/11/2026, Davi: "queria saber o que a pessoa selecionou, não consigo ver as opções"):
-- o lead é gravado quando a pessoa deixa o contato; na V3 as perguntas "objetivos" e os livros curtidos vêm depois. Esta função
-- completa as respostas do MESMO lead (mesma sessão, até 1 dia depois). Só troca `respostas`; nada mais do lead muda.
CREATE OR REPLACE FUNCTION public.atualizar_respostas_quiz(p_slug text, p_sessao uuid, p_respostas jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE qid uuid;
BEGIN
  IF p_sessao IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_respostas, '[]'::jsonb)) > 100
     OR length(coalesce(p_respostas::text, '')) > 20000 THEN
    RAISE EXCEPTION 'respostas inválidas';
  END IF;
  SELECT id INTO qid FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado';
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE quiz_respostas SET respostas = p_respostas
   WHERE quiz_id = qid AND sessao = p_sessao AND criada_em > now() - interval '1 day';
END;
$$;
REVOKE ALL ON FUNCTION public.atualizar_respostas_quiz(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_respostas_quiz(text, uuid, jsonb) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
