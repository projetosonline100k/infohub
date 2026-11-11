-- Prévia do link do quiz (11/11/2026, Davi: "o que posso fazer para aparecer uma imagem?"): o cartão que o Instagram/WhatsApp
-- montam ao receber o link mostra título, descrição e imagem escolhidos aqui (sem precisar publicar o quiz de novo).
-- Sem escolha, usa o título e a imagem de abertura do quiz.
ALTER TABLE public.quizzes ADD COLUMN compartilhar jsonb;   -- {titulo?, descricao?, imagem?}

CREATE OR REPLACE FUNCTION public.quiz_previa(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'titulo', coalesce(nullif(btrim(compartilhar->>'titulo'), ''), nullif(btrim(e->'intro'->>'titulo'), ''), titulo),
    'descricao', coalesce(nullif(btrim(compartilhar->>'descricao'), ''), nullif(btrim(e->'intro'->>'subtitulo'), ''), ''),
    'imagem', coalesce(nullif(btrim(compartilhar->>'imagem'), ''), nullif(btrim(e->'intro'->>'imagem'), ''), ''))
  FROM (SELECT titulo, compartilhar, CASE WHEN status = 'publicado' THEN coalesce(estrutura_publicada, estrutura) ELSE estrutura END AS e
          FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status IN ('revisar', 'publicado')) q;
$$;
REVOKE ALL ON FUNCTION public.quiz_previa(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_previa(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
