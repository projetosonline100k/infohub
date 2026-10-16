-- Posts do Instagram (20261016140000): a legenda raramente repete o título do
-- card letra por letra ("em um mês" × "em 1 mês", "Tipos de pessoa" × "Tipos
-- de pessoas"). Além do começo igual, liga o reel ao card cuja primeira linha
-- da legenda é parecida com o título (trigramas, pg_trgm >= 0,62). Abaixo
-- disso entram vídeos diferentes de tema vizinho ("4 tipos de amigos que você
-- pode se permitir perder" × "… não deveria perder" dá 0,60).
CREATE OR REPLACE FUNCTION public.instagram_post_ligar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_legenda text; v_linha text; v_primeira text;
BEGIN
  IF NEW.video_vertical_id IS NOT NULL OR NEW.carrossel_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT id INTO NEW.carrossel_id FROM public.carrosseis WHERE ig_media_id = NEW.ig_media_id LIMIT 1;
  IF NEW.carrossel_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT video_vertical_id INTO NEW.video_vertical_id FROM public.reels
    WHERE ig_media_id = NEW.ig_media_id AND video_vertical_id IS NOT NULL LIMIT 1;
  IF NEW.video_vertical_id IS NOT NULL OR NEW.tipo IS DISTINCT FROM 'REELS' OR NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Reel postado à mão: a legenda começa pelo título do card, ou a primeira
  -- linha é parecida com ele. Pelo menos 12 letras, para não casar por acaso.
  -- Prefere o mais parecido e, empatado, o card que ainda não estava 'postado'.
  v_legenda := public.instagram_texto_comparavel(NEW.legenda);
  v_primeira := lower(split_part(coalesce(NEW.legenda, ''), E'\n', 1));
  v_linha := public.instagram_texto_comparavel(v_primeira);
  SELECT v.id INTO NEW.video_vertical_id
  FROM public.videos_vertical v
  WHERE v.cliente_id = NEW.cliente_id
    AND v.created_at <= NEW.publicado_em
    AND length(public.instagram_texto_comparavel(v.titulo)) >= 12
    AND (v_legenda LIKE public.instagram_texto_comparavel(v.titulo) || '%'
         OR (length(v_linha) >= 12 AND public.instagram_texto_comparavel(v.titulo) LIKE v_linha || '%')
         OR (length(v_linha) >= 12 AND similarity(lower(v.titulo), v_primeira) >= 0.62))
    AND NOT EXISTS (SELECT 1 FROM public.instagram_posts p
                    WHERE p.video_vertical_id = v.id AND p.ig_media_id <> NEW.ig_media_id)
  ORDER BY (v_legenda LIKE public.instagram_texto_comparavel(v.titulo) || '%') DESC,
           similarity(lower(v.titulo), v_primeira) DESC, (v.status = 'postado'), v.created_at DESC
  LIMIT 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.instagram_post_ligar() FROM public, anon, authenticated;

-- Tenta de novo os posts que ainda não ligaram (o trigger roda no UPDATE).
UPDATE public.instagram_posts SET atualizado_em = now()
  WHERE video_vertical_id IS NULL AND carrossel_id IS NULL AND tipo = 'REELS';
