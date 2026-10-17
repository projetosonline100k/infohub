-- A Dalila programa sozinha (pedido do Davi, 17/10/2026): "sempre que eu
-- aprovar os vídeos, quero que você nem me pergunte os dias, veja qual dia está
-- em falta e você mesmo programe; caso eu queira um dia específico, eu mesmo
-- vou lá e mudo". Vale para reel e carrossel.
--   carrossel aprovado (Roy)        → 1º dia sem carrossel, às 10h
--   reel pronto (Danilo + Dalila)   → 1º dia sem reel, às 18h; o Short do
--                                      YouTube vai junto quando o canal do
--                                      projeto está ligado (título = headline)
-- Aprovar passa a ser o ok para publicar, com a legenda da Dalila (editável
-- até a hora do post). A tarefa do Davi nasce já concluída ("A Dalila
-- programou…"): se a publicação falhar, a edge dalila-publicar reabre ela
-- como "Escolher nova data" (igual antes). Projeto sem Instagram, sem legenda
-- ou já programado uma vez pela Dalila cai no caminho antigo ("Escolher data").
-- Os testes do caminho antigo desligam com set_config('dalila.programar_sozinha', 'off', true).

ALTER TABLE public.carrosseis ADD COLUMN programado_pela_dalila_em timestamptz;
ALTER TABLE public.reels ADD COLUMN programado_pela_dalila_em timestamptz;
GRANT SELECT (programado_pela_dalila_em) ON public.carrosseis TO authenticated;
GRANT SELECT (programado_pela_dalila_em) ON public.reels TO authenticated;

-- 1. O primeiro horário livre do ritmo (mesma conta de sugerirData em
-- src/lib/empresa/programacao.ts): a partir de hoje, o dia em que o horário
-- ainda não passou (10 min de folga) e que não tem post desse tipo.
CREATE FUNCTION public.dalila_proximo_horario(p_cliente uuid, p_tipo text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hora time := CASE WHEN p_tipo = 'reel' THEN time '18:00' ELSE time '10:00' END;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dia date;
  v_quando timestamptz;
BEGIN
  FOR i IN 0..365 LOOP
    v_dia := v_hoje + i;
    v_quando := (v_dia + v_hora) AT TIME ZONE 'America/Sao_Paulo';
    CONTINUE WHEN v_quando < now() + interval '10 minutes';
    IF p_tipo = 'reel' THEN
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.reels WHERE cliente_id = p_cliente
        AND status IN ('programado', 'publicando', 'publicado')
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

CREATE FUNCTION public.dalila_programa_sozinha_ligada()
RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('dalila.programar_sozinha', true), '') <> 'off' $$;

-- 2. Reel pronto → programado. Devolve false quando não dá (caminho antigo).
CREATE FUNCTION public.dalila_programar_reel_sozinha(p_reel uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.reels;
  v_davi public.membros;
  v_quando timestamptz;
  v_txt text;
  v_yt boolean := false;
  v_tarefa uuid;
BEGIN
  IF NOT public.dalila_programa_sozinha_ligada() THEN RETURN false; END IF;
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pronto' OR r.programado_para IS NOT NULL OR r.tarefa_data_id IS NOT NULL
     OR r.ig_media_id IS NOT NULL OR r.programado_pela_dalila_em IS NOT NULL OR r.video_url IS NULL
     OR nullif(trim(coalesce(r.legenda, '')), '') IS NULL OR length(r.legenda) > 2200
     OR public.dalila_conexao_do_projeto(r.cliente_id) IS NULL THEN
    RETURN false;
  END IF;
  -- Dois reels ficando prontos juntos não pegam o mesmo dia.
  PERFORM pg_advisory_xact_lock(hashtext('dalila-dia:reel:' || r.cliente_id));
  v_quando := public.dalila_proximo_horario(r.cliente_id, 'reel');
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
      'A Dalila programou o reel: ' || r.titulo, 'agendar_reel', 'alta',
      'Programado sozinho para ' || v_txt || CASE WHEN v_yt THEN ' (Instagram e Short no YouTube)' ELSE '' END
        || ', no primeiro dia sem reel. Para mudar o dia ou a legenda, clique no reel em Conteúdo → Visão geral → Programados (até a hora do post).',
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

CREATE OR REPLACE FUNCTION public.reel_pronto_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_davi public.membros;
BEGIN
  IF NEW.tarefa_data_id IS NOT NULL OR NEW.programado_para IS NOT NULL THEN RETURN NULL; END IF;
  IF public.dalila_programar_reel_sozinha(NEW.id) THEN RETURN NULL; END IF;
  SELECT * INTO v_davi FROM public.membros
    WHERE cliente_id = NEW.cliente_id AND ativo AND conta_id = NEW.user_id LIMIT 1;
  IF v_davi.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.reels SET tarefa_data_id = public.dalila_tarefa(NEW.cliente_id, NEW.user_id, v_davi,
    'Escolher data do reel: ' || NEW.titulo, 'agendar_reel', 'alta',
    'Confira a legenda e escolha o dia e a hora em Conteúdo → Visão geral → Precisa de você. A Dalila publica sozinha nesse horário.',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  WHERE id = NEW.id;
  RETURN NULL;
END;
$$;

-- 3. Carrossel aprovado → programado.
CREATE FUNCTION public.dalila_programar_carrossel_sozinha(p_carrossel uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.carrosseis;
  v_dono uuid;
  v_davi public.membros;
  v_nome text;
  v_quando timestamptz;
  v_txt text;
  v_tarefa uuid;
BEGIN
  IF NOT public.dalila_programa_sozinha_ligada() THEN RETURN false; END IF;
  SELECT * INTO c FROM public.carrosseis WHERE id = p_carrossel FOR UPDATE;
  IF c.id IS NULL OR c.status <> 'aprovado' OR c.programado_para IS NOT NULL OR c.tarefa_data_id IS NOT NULL
     OR c.ig_media_id IS NOT NULL OR c.programado_pela_dalila_em IS NOT NULL OR cardinality(c.paginas) = 0
     OR nullif(trim(coalesce(c.legenda, '')), '') IS NULL OR length(c.legenda) > 2200
     OR public.dalila_conexao_do_projeto(c.cliente_id) IS NULL THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dalila-dia:carrossel:' || c.cliente_id));
  v_quando := public.dalila_proximo_horario(c.cliente_id, 'carrossel');
  IF v_quando IS NULL THEN RETURN false; END IF;
  v_txt := to_char(v_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  v_dono := coalesce(c.user_id, (SELECT user_id FROM public.clientes WHERE id = c.cliente_id));
  v_nome := CASE WHEN c.numero IS NULL THEN '' ELSE lpad(c.numero::text, 3, '0') || ' · ' END || c.tema;

  UPDATE public.carrosseis SET status = 'programado', programado_para = v_quando, publicacao_tentativas = 0,
    ig_container_id = NULL, ig_container_em = NULL, paginas_jpg = '{}', publicacao_trava_ate = NULL,
    programado_pela_dalila_em = now(), mensagem = 'Dalila programou sozinha: publica em ' || v_txt, atualizado_em = now()
  WHERE id = c.id;

  SELECT * INTO v_davi FROM public.membros WHERE cliente_id = c.cliente_id AND ativo AND conta_id = v_dono LIMIT 1;
  IF v_davi.id IS NOT NULL THEN
    v_tarefa := public.dalila_tarefa(c.cliente_id, v_dono, v_davi,
      'A Dalila programou o carrossel: ' || v_nome, 'agendar', 'alta',
      'Programado sozinho para ' || v_txt || ', no primeiro dia sem carrossel. Para mudar o dia ou a legenda, clique no carrossel em Conteúdo → Visão geral → Programados (até a hora do post).',
      (v_quando AT TIME ZONE 'America/Sao_Paulo')::date);
    UPDATE public.atividades SET concluida = true, situacao = 'concluida', observacao = 'Programado para ' || v_txt WHERE id = v_tarefa;
    UPDATE public.carrosseis SET tarefa_data_id = v_tarefa WHERE id = c.id;
  END IF;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida',
    observacao = 'Programado: publica em ' || v_txt,
    data_vencimento = (v_quando AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = c.atividade_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dalila_programar_carrossel_sozinha(uuid) FROM public, anon, authenticated;

-- Na aprovação: primeiro nasce a tarefa da Dalila (carrossel_criar_tarefas),
-- mas a "Escolher data" do Davi só se a Dalila não conseguir programar.
CREATE OR REPLACE FUNCTION public.carrossel_criar_tarefas(p_carrossel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.carrosseis;
  v_dono uuid;
  v_pasta uuid;
  v_coluna text;
  v_dalila public.membros;
  v_davi public.membros;
  v_nome text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_id uuid;
BEGIN
  SELECT * INTO c FROM public.carrosseis WHERE id = p_carrossel FOR UPDATE;
  IF c.id IS NULL OR c.status <> 'aprovado' THEN RETURN; END IF;
  v_dono := coalesce(c.user_id, (SELECT user_id FROM public.clientes WHERE id = c.cliente_id));
  v_nome := CASE WHEN c.numero IS NULL THEN '' ELSE lpad(c.numero::text, 3, '0') || ' · ' END || c.tema;
  SELECT id INTO v_pasta FROM public.pastas_atividade
    WHERE cliente_id = c.cliente_id AND deleted_at IS NULL ORDER BY ordem LIMIT 1;
  SELECT status_key INTO v_coluna FROM public.colunas_atividade
    WHERE cliente_id = c.cliente_id ORDER BY ordem LIMIT 1;

  IF c.atividade_id IS NULL THEN
    SELECT * INTO v_dalila FROM public.membros
      WHERE cliente_id = c.cliente_id AND ativo AND (lower(nome) = 'dalila' OR funcao ILIKE '%social%')
      ORDER BY (lower(nome) = 'dalila') DESC LIMIT 1;
    IF v_dalila.id IS NOT NULL THEN
      INSERT INTO public.atividades (titulo, cliente_id, user_id, pasta_id, data_atividade, status, concluida, ordem,
        prioridade, responsavel_id, setor_id, situacao, tipo, descricao)
      VALUES ('Programar carrossel: ' || v_nome || ' (' || cardinality(c.paginas) || ' páginas)', c.cliente_id, v_dono,
        v_pasta, v_hoje, coalesce(v_coluna, 'backlog'), false, 0, 'media', v_dalila.id, v_dalila.setor_id, 'fila',
        'programacao', 'Carrossel do Roy aprovado pelo Davi. A Dalila programa no primeiro dia livre e publica sozinha.')
      RETURNING id INTO v_id;
      UPDATE public.carrosseis SET atividade_id = v_id WHERE id = c.id;
    END IF;
  END IF;

  IF c.tarefa_data_id IS NULL AND c.programado_para IS NULL THEN
    IF public.dalila_programar_carrossel_sozinha(c.id) THEN RETURN; END IF;
    SELECT * INTO v_davi FROM public.membros
      WHERE cliente_id = c.cliente_id AND ativo AND conta_id = v_dono LIMIT 1;
    IF v_davi.id IS NOT NULL THEN
      INSERT INTO public.atividades (titulo, cliente_id, user_id, pasta_id, data_atividade, data_vencimento, status,
        concluida, ordem, prioridade, responsavel_id, setor_id, situacao, tipo, descricao)
      VALUES ('Escolher data do carrossel: ' || v_nome, c.cliente_id, v_dono, v_pasta, v_hoje, v_hoje,
        coalesce(v_coluna, 'backlog'), false, 0, 'alta', v_davi.id, v_davi.setor_id, 'fila', 'agendar',
        'Escolha o dia e a hora em Conteúdo → Visão geral → Precisa de você. A Dalila publica sozinha nesse horário.')
      RETURNING id INTO v_id;
      UPDATE public.carrosseis SET tarefa_data_id = v_id WHERE id = c.id;
    END IF;
  END IF;
END;
$$;

-- 4. Mudar a legenda do carrossel até a hora do post (no reel já dava).
DROP FUNCTION public.programar_carrossel(uuid, timestamptz);
CREATE FUNCTION public.programar_carrossel(p_carrossel uuid, p_quando timestamptz, p_legenda text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE c public.carrosseis;
BEGIN
  SELECT * INTO c FROM public.carrosseis WHERE id = p_carrossel FOR UPDATE;
  IF c.id IS NULL OR NOT public.team_row_allowed('carrosseis', to_jsonb(c), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Carrossel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF c.ig_media_id IS NOT NULL OR c.status NOT IN ('aprovado', 'programado', 'erro')
     OR (c.status = 'erro' AND c.programado_para IS NULL) THEN
    RAISE EXCEPTION 'Esse carrossel não pode ser programado agora (%).', c.status;
  END IF;
  IF p_quando IS NULL OR p_quando < now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'Escolha um horário no futuro.';
  END IF;
  IF p_legenda IS NOT NULL AND nullif(trim(p_legenda), '') IS NULL THEN RAISE EXCEPTION 'Escreva a legenda do carrossel.'; END IF;
  IF length(p_legenda) > 2200 THEN RAISE EXCEPTION 'A legenda passa de 2.200 caracteres (limite do Instagram).'; END IF;
  UPDATE public.carrosseis SET status = 'programado', programado_para = p_quando, publicacao_tentativas = 0,
    ig_container_id = NULL, ig_container_em = NULL, paginas_jpg = '{}', publicacao_trava_ate = NULL,
    legenda = coalesce(trim(p_legenda), legenda),
    mensagem = 'Dalila publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    atualizado_em = now()
  WHERE id = c.id;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida' WHERE id = c.tarefa_data_id;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida',
    observacao = 'Programado: publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    data_vencimento = (p_quando AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = c.atividade_id;
END;
$$;
REVOKE ALL ON FUNCTION public.programar_carrossel(uuid, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.programar_carrossel(uuid, timestamptz, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
