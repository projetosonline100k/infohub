-- Posts do Instagram com os números de cada um (melhoria do Pedro, 16/10/2026).
-- A edge `instagram-metricas` (pg_cron às 03:10 e o botão "Atualizar" do
-- painel) passa a guardar também os posts dos últimos 35 dias de cada conta,
-- com visualizações, alcance, curtidas, comentários, salvamentos e
-- compartilhamentos. Cada post é ligado ao que gerou ele:
--   - carrossel do Roy/Dalila: pelo ig_media_id do carrossel;
--   - reel da Dalila: pelo ig_media_id do reel → card do cronograma;
--   - reel postado à mão: pelo começo da legenda = título do card.
-- O card ligado vira 'postado' no dia em que o post foi ao ar.
-- Sem IA: é código puro, não gasta token.
CREATE TABLE public.instagram_posts (
  ig_media_id text PRIMARY KEY,
  ig_user_id text NOT NULL REFERENCES public.instagram_conexoes(ig_user_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,            -- dono da conexão
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL, -- projeto (trigger, mesma regra das métricas)
  username text,
  tipo text,                        -- media_product_type: FEED, REELS, STORY
  formato text,                     -- media_type: IMAGE, VIDEO, CAROUSEL_ALBUM
  legenda text,
  permalink text,
  publicado_em timestamptz NOT NULL,
  visualizacoes integer,
  alcance integer,
  curtidas integer,
  comentarios integer,
  salvamentos integer,
  compartilhamentos integer,
  erro text,                        -- ex.: falta a permissão de insights
  video_vertical_id uuid REFERENCES public.videos_vertical(id) ON DELETE SET NULL,
  carrossel_id uuid REFERENCES public.carrosseis(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_posts_cliente_idx ON public.instagram_posts (cliente_id, publicado_em);
CREATE UNIQUE INDEX instagram_posts_video_idx ON public.instagram_posts (video_vertical_id) WHERE video_vertical_id IS NOT NULL;

ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_posts FROM anon, authenticated;
GRANT SELECT ON public.instagram_posts TO authenticated;
CREATE POLICY "dono_ou_equipe_le" ON public.instagram_posts FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR (cliente_id IS NOT NULL AND public.team_allowed(cliente_id, 'conteudo', 'acessar')));

-- Dono e projeto vêm da conexão (mesma função das métricas diárias).
CREATE TRIGGER instagram_posts_1_projeto BEFORE INSERT OR UPDATE ON public.instagram_posts
  FOR EACH ROW EXECUTE FUNCTION public.instagram_metricas_projeto();

-- Texto só com letras e números, sem acento, para comparar legenda e título.
CREATE FUNCTION public.instagram_texto_comparavel(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(translate(lower(coalesce(p, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]', '', 'g');
$$;

-- Liga o post ao carrossel ou ao card do cronograma (só enquanto não ligado).
CREATE FUNCTION public.instagram_post_ligar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_legenda text; v_linha text;
BEGIN
  IF NEW.video_vertical_id IS NOT NULL OR NEW.carrossel_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT id INTO NEW.carrossel_id FROM public.carrosseis WHERE ig_media_id = NEW.ig_media_id LIMIT 1;
  IF NEW.carrossel_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT video_vertical_id INTO NEW.video_vertical_id FROM public.reels
    WHERE ig_media_id = NEW.ig_media_id AND video_vertical_id IS NOT NULL LIMIT 1;
  IF NEW.video_vertical_id IS NOT NULL OR NEW.tipo IS DISTINCT FROM 'REELS' OR NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Reel postado à mão: a legenda começa pelo título do card (ou a primeira
  -- linha da legenda é o começo do título). Pelo menos 12 letras, para não
  -- casar por acaso. Prefere card que ainda não estava 'postado'.
  v_legenda := public.instagram_texto_comparavel(NEW.legenda);
  v_linha := public.instagram_texto_comparavel(split_part(coalesce(NEW.legenda, ''), E'\n', 1));
  SELECT v.id INTO NEW.video_vertical_id
  FROM public.videos_vertical v
  WHERE v.cliente_id = NEW.cliente_id
    AND v.created_at <= NEW.publicado_em
    AND length(public.instagram_texto_comparavel(v.titulo)) >= 12
    AND (v_legenda LIKE public.instagram_texto_comparavel(v.titulo) || '%'
         OR (length(v_linha) >= 12 AND public.instagram_texto_comparavel(v.titulo) LIKE v_linha || '%'))
    AND NOT EXISTS (SELECT 1 FROM public.instagram_posts p
                    WHERE p.video_vertical_id = v.id AND p.ig_media_id <> NEW.ig_media_id)
  ORDER BY (v.status = 'postado'), v.created_at DESC
  LIMIT 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER instagram_posts_2_ligar BEFORE INSERT OR UPDATE ON public.instagram_posts
  FOR EACH ROW EXECUTE FUNCTION public.instagram_post_ligar();

-- Card recém-ligado vira 'postado' no dia (Brasília) em que o post foi ao ar.
CREATE FUNCTION public.instagram_post_marca_postado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.video_vertical_id IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.video_vertical_id IS NOT DISTINCT FROM NEW.video_vertical_id) THEN
    RETURN NULL;
  END IF;
  UPDATE public.videos_vertical
    SET status = 'postado', data_postagem = (NEW.publicado_em AT TIME ZONE 'America/Sao_Paulo')::date
    WHERE id = NEW.video_vertical_id
      AND (status <> 'postado' OR data_postagem IS NULL);
  RETURN NULL;
END;
$$;
CREATE TRIGGER instagram_posts_3_postado AFTER INSERT OR UPDATE ON public.instagram_posts
  FOR EACH ROW EXECUTE FUNCTION public.instagram_post_marca_postado();

REVOKE ALL ON FUNCTION public.instagram_post_ligar(), public.instagram_post_marca_postado() FROM public, anon, authenticated;

NOTIFY pgrst, 'reload schema';
