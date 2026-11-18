-- Pixels do quiz (18/11/2026, Davi: "no quiz, eu consiga adicionar pixel e seja funcional"): ids da Meta, do TikTok e do Google
-- (GA4/Ads/GTM) ficam em quizzes.pixels e vão para a página pública junto do quiz. As versões (V2…) usam os do quiz original
-- quando não têm os próprios. São ids públicos (aparecem no código de qualquer site), por isso saem pelo RPC aberto.
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS pixels jsonb;   -- {meta?, tiktok?, ga4?, google_ads?, gtm?}
GRANT UPDATE (pixels) ON public.quizzes TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_publico(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('titulo', q.titulo,
           'estrutura', CASE WHEN q.status = 'publicado' THEN coalesce(q.estrutura_publicada, q.estrutura) ELSE q.estrutura END,
           'pixels', coalesce(q.pixels, (SELECT r.pixels FROM quizzes r WHERE r.id = q.variante_de)))
    FROM quizzes q WHERE (q.slug = p_slug OR p_slug = ANY (q.slugs_antigos)) AND q.status IN ('revisar', 'publicado');
$function$;

NOTIFY pgrst, 'reload schema';
