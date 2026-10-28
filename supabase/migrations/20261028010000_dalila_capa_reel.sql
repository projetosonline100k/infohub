-- Capa do reel (pedido do Davi, 27/10/2026): sem capa, o Instagram pega o 1º
-- quadro, que tem a lousa ainda vazia em cima ("parte preta" no feed). A
-- Dalila escolhe o melhor quadro (scripts/dalila/capa.py) e a edge
-- dalila-publicar manda como thumb_offset. O Davi troca em Programados.
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS capa_ms integer CHECK (capa_ms >= 0),
  ADD COLUMN IF NOT EXISTS capa_sugestoes integer[],
  ADD COLUMN IF NOT EXISTS capa_pelo_davi boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reels.capa_ms IS 'Quadro da capa (ms do vídeo), enviado à Meta como thumb_offset.';
COMMENT ON COLUMN public.reels.capa_sugestoes IS 'Melhores quadros (ms) escolhidos pela Dalila, o 1º é o dela.';
COMMENT ON COLUMN public.reels.capa_pelo_davi IS 'O Davi trocou a capa: a Dalila não refaz a escolha.';

CREATE OR REPLACE FUNCTION public.escolher_capa_reel(p_reel uuid, p_ms integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('reels', to_jsonb(r), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Reel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.ig_media_id IS NOT NULL OR r.status NOT IN ('pronto', 'programado') THEN
    RAISE EXCEPTION 'A capa deste reel não pode mudar agora (%). Reel publicado só muda a capa pelo app do Instagram.', r.status;
  END IF;
  IF p_ms IS NULL OR p_ms < 0 OR (r.duracao IS NOT NULL AND p_ms > r.duracao * 1000) THEN
    RAISE EXCEPTION 'Esse quadro está fora do vídeo.';
  END IF;
  -- Container já criado foi sem esta capa: a Meta cria outro na hora de publicar.
  UPDATE public.reels SET capa_ms = p_ms, capa_pelo_davi = true, ig_container_id = NULL, ig_container_em = NULL,
    atualizado_em = now()
  WHERE id = r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.escolher_capa_reel(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.escolher_capa_reel(uuid, integer) TO authenticated;
