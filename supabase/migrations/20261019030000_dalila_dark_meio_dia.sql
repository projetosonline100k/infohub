-- Vídeos dark do Danilo com horário próprio (pedido do Davi, 19/10/2026):
-- "esses vídeos pode postar 12:00". Reel dark (edicoes_video.formato = 'dark')
-- pronto → a Dalila programa sozinha no 1º dia sem dark, às 12h. O reel normal
-- continua às 18h, e um não toma o dia do outro (cada um contado à parte).
-- Só hoje (19/10) o meio-dia já passou: o primeiro dark ("Versão dark: 6
-- hábitos"), que ela tinha posto em 23/10 às 18h, sai às 20h de hoje.

CREATE FUNCTION public.reel_eh_dark(p_edicao uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce((SELECT formato = 'dark' FROM public.edicoes_video WHERE id = p_edicao), false) $$;
REVOKE ALL ON FUNCTION public.reel_eh_dark(uuid) FROM public, anon, authenticated;

-- 1. 'dark' = 12h, contado só entre os darks; 'reel' passa a não contar os darks.
CREATE OR REPLACE FUNCTION public.dalila_proximo_horario(p_cliente uuid, p_tipo text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hora time := CASE p_tipo WHEN 'reel' THEN time '18:00' WHEN 'dark' THEN time '12:00' ELSE time '10:00' END;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dia date;
  v_quando timestamptz;
BEGIN
  FOR i IN 0..365 LOOP
    v_dia := v_hoje + i;
    v_quando := (v_dia + v_hora) AT TIME ZONE 'America/Sao_Paulo';
    CONTINUE WHEN v_quando < now() + interval '10 minutes';
    IF p_tipo IN ('reel', 'dark') THEN
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.reels WHERE cliente_id = p_cliente
        AND status IN ('programado', 'publicando', 'publicado')
        AND public.reel_eh_dark(edicao_id) = (p_tipo = 'dark')
        AND (coalesce(publicado_em, programado_para) AT TIME ZONE 'America/Sao_Paulo')::date = v_dia);
    ELSE
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.carrosseis WHERE cliente_id = p_cliente
        AND status IN ('programado', 'publicando', 'publicado')
        AND (coalesce(publicado_em, programado_para) AT TIME ZONE 'America/Sao_Paulo')::date = v_dia);
    END IF;
    RETURN v_quando;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.dalila_proximo_horario(uuid, text) FROM public, anon, authenticated;

-- 2. Reel pronto → programado, agora sabendo se é dark (12h) ou normal (18h).
CREATE OR REPLACE FUNCTION public.dalila_programar_reel_sozinha(p_reel uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.reels;
  v_davi public.membros;
  v_quando timestamptz;
  v_txt text;
  v_yt boolean := false;
  v_tarefa uuid;
  v_tipo text;
  v_nome text;
BEGIN
  IF NOT public.dalila_programa_sozinha_ligada() THEN RETURN false; END IF;
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pronto' OR r.programado_para IS NOT NULL OR r.tarefa_data_id IS NOT NULL
     OR r.ig_media_id IS NOT NULL OR r.programado_pela_dalila_em IS NOT NULL OR r.video_url IS NULL
     OR nullif(trim(coalesce(r.legenda, '')), '') IS NULL OR length(r.legenda) > 2200
     OR public.dalila_conexao_do_projeto(r.cliente_id) IS NULL THEN
    RETURN false;
  END IF;
  v_tipo := CASE WHEN public.reel_eh_dark(r.edicao_id) THEN 'dark' ELSE 'reel' END;
  v_nome := CASE v_tipo WHEN 'dark' THEN 'vídeo dark' ELSE 'reel' END;
  -- Dois reels do mesmo tipo ficando prontos juntos não pegam o mesmo dia.
  PERFORM pg_advisory_xact_lock(hashtext('dalila-dia:' || v_tipo || ':' || r.cliente_id));
  v_quando := public.dalila_proximo_horario(r.cliente_id, v_tipo);
  IF v_quando IS NULL THEN RETURN false; END IF;
  v_txt := to_char(v_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');

  UPDATE public.reels SET status = 'programado', programado_para = v_quando, legenda = trim(legenda),
    publicacao_tentativas = 0, ig_container_id = NULL, ig_container_em = NULL, publicacao_trava_ate = NULL,
    programado_pela_dalila_em = now(), mensagem = 'Dalila programou sozinha: publica em ' || v_txt, atualizado_em = now()
  WHERE id = r.id;

  -- Short no YouTube junto, quando o canal do projeto está ligado. Dinâmico:
  -- antes da migração 20261016121500 (YouTube) a tabela e as colunas yt_* não existem.
  IF to_regclass('public.youtube_conexoes') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.youtube_conexoes WHERE cliente_id = $1)' INTO v_yt USING r.cliente_id;
    IF v_yt THEN
      EXECUTE 'UPDATE public.reels SET yt_publicar = true, yt_titulo = $2, yt_status = ''programado'', yt_programado_para = $3,
          yt_tentativas = 0, yt_sessao = NULL, yt_trava_ate = NULL, yt_mensagem = $4
        WHERE id = $1 AND yt_video_id IS NULL'
      USING r.id, left(trim(regexp_replace(r.titulo, '[<>]', '', 'g')), 100), v_quando, 'Short no YouTube em ' || v_txt;
    END IF;
  END IF;

  -- A tarefa do Davi nasce concluída (é o aviso); a nuvem reabre se falhar.
  SELECT * INTO v_davi FROM public.membros WHERE cliente_id = r.cliente_id AND ativo AND conta_id = r.user_id LIMIT 1;
  IF v_davi.id IS NOT NULL THEN
    v_tarefa := public.dalila_tarefa(r.cliente_id, r.user_id, v_davi,
      'A Dalila programou o ' || v_nome || ': ' || r.titulo, 'agendar_reel', 'alta',
      'Programado sozinho para ' || v_txt || CASE WHEN v_yt THEN ' (Instagram e Short no YouTube)' ELSE '' END
        || ', no primeiro dia sem ' || v_nome || '. Para mudar o dia ou a legenda, clique no reel em Conteúdo → Visão geral → Programados (até a hora do post).',
      (v_quando AT TIME ZONE 'America/Sao_Paulo')::date);
    UPDATE public.atividades SET concluida = true, situacao = 'concluida', observacao = 'Programado para ' || v_txt WHERE id = v_tarefa;
    UPDATE public.reels SET tarefa_data_id = v_tarefa WHERE id = r.id;
  END IF;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida',
    observacao = 'Programado: publica em ' || v_txt || CASE WHEN v_yt THEN ' (Instagram e YouTube)' ELSE '' END,
    data_vencimento = (v_quando AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = r.atividade_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dalila_programar_reel_sozinha(uuid) FROM public, anon, authenticated;

-- 3. Só hoje: o dark "6 hábitos" (estava em 23/10 às 18h) vai para 19/10 às 20h,
-- se ainda não saiu e se ainda dá tempo. programado_pela_dalila_em = now() faz o sino avisar de novo.
DO $$
DECLARE
  v_quando timestamptz := timestamptz '2026-10-19 20:00 America/Sao_Paulo';
  v_txt text := '19/10 às 20:00';
  r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = '36606ab3-874b-453a-98f4-b90fbae1fd32'
    AND status = 'programado' AND ig_media_id IS NULL FOR UPDATE;
  IF r.id IS NULL OR now() > v_quando - interval '10 minutes' THEN RETURN; END IF;
  UPDATE public.reels SET programado_para = v_quando, programado_pela_dalila_em = now(),
    publicacao_tentativas = 0, ig_container_id = NULL, ig_container_em = NULL, publicacao_trava_ate = NULL,
    mensagem = 'Dalila programou sozinha: publica em ' || v_txt || ' (primeiro dark, pedido do Davi)', atualizado_em = now()
  WHERE id = r.id;
  UPDATE public.atividades SET titulo = 'A Dalila programou o vídeo dark: ' || r.titulo,
    descricao = 'Programado para ' || v_txt || ' (hoje o meio-dia já tinha passado; a partir de amanhã os darks saem às 12h). '
      || 'Para mudar o dia ou a legenda, clique no reel em Conteúdo → Visão geral → Programados (até a hora do post).',
    observacao = 'Programado para ' || v_txt, data_vencimento = date '2026-10-19', data_atividade = date '2026-10-19'
  WHERE id = r.tarefa_data_id;
  UPDATE public.atividades SET observacao = 'Programado: publica em ' || v_txt, data_vencimento = date '2026-10-19'
  WHERE id = r.atividade_id;
END $$;

NOTIFY pgrst, 'reload schema';
