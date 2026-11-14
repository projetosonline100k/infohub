-- Programação automática dos vídeos dark (13/11/2026, Davi: "sempre que eu aprovar os vídeos, nem preciso confirmar, pode já programar para as 18 horas padrão").
-- Aprovar continua sendo o ok: só o vídeo que o Davi aprovou (status 'programando') é programado. Quando o Mac termina de preparar o vídeo (video_url),
-- esta função escolhe o horário (18:00 de Brasília, ou a hora do estilo.publicacao.hora) e a legenda e põe em 'programado'; a edge lauro-publicar publica na hora.
-- Dia: o dia marcado no roteiro, se ainda der tempo; senão o primeiro dia livre (sem outro vídeo programado/publicado do perfil). Sem Instagram conectado, nada acontece.
CREATE FUNCTION public.lauro_programar_auto(p_roteiro uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.esteira_dark_roteiros; est jsonb; hora time; dia date; slot timestamptz; v_legenda text; v_titulo text; v_extra text; i integer;
BEGIN
  SELECT * INTO r FROM public.esteira_dark_roteiros WHERE id = p_roteiro FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'programando' OR r.video_url IS NULL OR r.ig_media_id IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.instagram_conexoes WHERE perfil_dark_id = r.perfil_id) THEN RETURN NULL; END IF;
  SELECT estilo INTO est FROM public.esteira_dark_perfis WHERE id = r.perfil_id;
  hora := coalesce(nullif(est #>> '{publicacao,hora}', '')::time, time '18:00');
  slot := ((r.data_postagem + hora) AT TIME ZONE 'America/Sao_Paulo');
  IF r.data_postagem IS NULL OR slot < now() + interval '5 minutes' THEN
    dia := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    FOR i IN 0..90 LOOP
      slot := (((dia + i) + hora) AT TIME ZONE 'America/Sao_Paulo');
      IF slot >= now() + interval '5 minutes' AND NOT EXISTS (
        SELECT 1 FROM public.esteira_dark_roteiros o WHERE o.perfil_id = r.perfil_id AND o.id <> r.id AND o.status IN ('programado', 'publicando', 'publicado')
          AND (o.programado_para AT TIME ZONE 'America/Sao_Paulo')::date = (slot AT TIME ZONE 'America/Sao_Paulo')::date) THEN EXIT; END IF;
    END LOOP;
  END IF;
  v_titulo := btrim(regexp_replace(coalesce(nullif(btrim(r.legenda), ''), r.titulo), '[,;:\s]+$', ''));
  v_extra := nullif(btrim(est #>> '{publicacao,legenda_padrao}'), '');
  v_legenda := left(v_titulo || CASE WHEN v_extra IS NULL THEN '' ELSE E'\n\n' || v_extra END, 2200);
  UPDATE public.esteira_dark_roteiros SET status = 'programado', programado_para = slot, legenda = v_legenda,
    publicacao_tentativas = 0, ig_container_id = NULL, ig_container_em = NULL, publicacao_trava_ate = NULL,
    mensagem = 'Programado sozinho: publica em ' || to_char(slot AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    data_postagem = (slot AT TIME ZONE 'America/Sao_Paulo')::date, atualizado_em = now()
  WHERE id = r.id;
  RETURN slot;
END; $$;
REVOKE ALL ON FUNCTION public.lauro_programar_auto(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lauro_programar_auto(uuid) TO service_role;
