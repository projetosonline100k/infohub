-- Teste A/B só entre versões (22/11/2026, Davi: "teste com e sem a abertura"): o quiz original (V1) sempre entrava no sorteio do próprio link.
-- Agora ele pode ficar de fora (ab_raiz_fora): o link do original sorteia só entre as versões publicadas e marcadas no teste.
-- Com menos de 2 participantes o sorteio continua vazio e o link mostra o original, como antes. Padrão = false (nada muda para quem já usa).
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS ab_raiz_fora boolean NOT NULL DEFAULT false;
GRANT UPDATE (ab_raiz_fora) ON public.quizzes TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_ab_slugs(p_slug text) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT id, slug, ab_raiz_fora FROM public.quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado' AND variante_de IS NULL LIMIT 1
  ), lista AS (
    SELECT b.slug AS s, 0 AS ord FROM base b WHERE NOT b.ab_raiz_fora
    UNION ALL
    SELECT v.slug, v.versao FROM public.quizzes v JOIN base b ON v.variante_de = b.id WHERE v.status = 'publicado' AND v.ab_ativo
  )
  SELECT CASE WHEN count(*) > 1 THEN array_agg(s ORDER BY ord) ELSE '{}'::text[] END FROM lista;
$$;
GRANT EXECUTE ON FUNCTION public.quiz_ab_slugs(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
