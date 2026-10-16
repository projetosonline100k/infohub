-- Reels pela Dalila (pedido do Davi, 16/10/2026): "vídeo é a mesma coisa do
-- carrossel: editou, finalizou, passa para a Dalila programar e postar".
--   edição aprovada (edicoes_video) → reel 'preparando' + tarefa da Dalila
--   → o Mac (scripts/dalila/preparar_reels.py) comprime o final para caber no
--     Storage (plano gratuito: 50 MB por arquivo), sobe e sugere a legenda
--   → 'pronto' + tarefa "Escolher data do reel" do Davi (tipo agendar_reel)
--   → o Davi escolhe dia/hora e confere a legenda (= o ok dele) → 'programado'
--   → edge dalila-publicar (pg_cron) publica no Instagram DO PROJETO → 'publicado'.
-- A Dalila nunca programa sozinha. Regra do Instagram: dalila_conexao_do_projeto.

CREATE TABLE public.reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  edicao_id uuid NOT NULL UNIQUE REFERENCES public.edicoes_video(id) ON DELETE CASCADE,
  video_vertical_id uuid REFERENCES public.videos_vertical(id) ON DELETE SET NULL,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,   -- "Programar reel" da Dalila
  tarefa_data_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL, -- "Escolher data do reel" do Davi
  titulo text NOT NULL,
  status text NOT NULL DEFAULT 'preparando'
    CHECK (status IN ('preparando', 'pronto', 'programado', 'publicando', 'publicado', 'erro', 'cancelado')),
  mensagem text,
  final_drive text,              -- o final do Danilo no Drive (fica lá, intacto)
  video_url text,                -- cópia comprimida no bucket público `reels` (sai depois de publicar)
  video_caminho text,
  video_bytes bigint,
  duracao numeric,
  legenda text,                  -- sugerida pela Dalila, editável pelo Davi
  token_envio uuid DEFAULT gen_random_uuid(), -- o Mac sobe o vídeo só com ele (o app não lê)
  preparo_tentativas integer NOT NULL DEFAULT 0,
  programado_para timestamptz,
  ig_container_id text,
  ig_container_em timestamptz,
  ig_media_id text,
  permalink text,
  publicado_em timestamptz,
  publicacao_tentativas integer NOT NULL DEFAULT 0,
  publicacao_trava_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reels_cliente_idx ON public.reels (cliente_id, status);

ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reels FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.reels
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.reels FOR SELECT TO authenticated
  USING (public.team_row_allowed('reels', to_jsonb(reels.*), 'atividades', 'acessar'));
-- O app só lê (sem o token); muda tudo pelas RPCs abaixo.
GRANT SELECT (id, cliente_id, user_id, edicao_id, video_vertical_id, atividade_id, tarefa_data_id, titulo, status,
  mensagem, final_drive, video_url, video_bytes, duracao, legenda, programado_para, ig_media_id, permalink,
  publicado_em, criado_em, atualizado_em) ON public.reels TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reels;

-- Pasta e coluna inicial das tarefas, como no carrossel.
CREATE FUNCTION public.dalila_tarefa(p_cliente uuid, p_dono uuid, p_responsavel public.membros, p_titulo text,
  p_tipo text, p_prioridade text, p_descricao text, p_vencimento date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pasta uuid; v_coluna text; v_id uuid;
BEGIN
  SELECT id INTO v_pasta FROM public.pastas_atividade
    WHERE cliente_id = p_cliente AND deleted_at IS NULL ORDER BY ordem LIMIT 1;
  SELECT status_key INTO v_coluna FROM public.colunas_atividade
    WHERE cliente_id = p_cliente ORDER BY ordem LIMIT 1;
  INSERT INTO public.atividades (titulo, cliente_id, user_id, pasta_id, data_atividade, data_vencimento, status,
    concluida, ordem, prioridade, responsavel_id, setor_id, situacao, tipo, descricao)
  VALUES (p_titulo, p_cliente, p_dono, v_pasta, (now() AT TIME ZONE 'America/Sao_Paulo')::date, p_vencimento,
    coalesce(v_coluna, 'backlog'), false, 0, p_prioridade, p_responsavel.id, p_responsavel.setor_id, 'fila', p_tipo, p_descricao)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dalila_tarefa(uuid, uuid, public.membros, text, text, text, text, date) FROM public, anon, authenticated;

-- 1. Edição aprovada → reel + tarefa da Dalila.
CREATE FUNCTION public.reel_da_edicao(p_edicao uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  e public.edicoes_video;
  v_dono uuid;
  v_titulo text;
  v_dalila public.membros;
  v_reel uuid;
BEGIN
  SELECT * INTO e FROM public.edicoes_video WHERE id = p_edicao;
  IF e.id IS NULL OR e.status <> 'aprovado' THEN RETURN NULL; END IF;
  SELECT id INTO v_reel FROM public.reels WHERE edicao_id = e.id;
  IF v_reel IS NOT NULL THEN RETURN v_reel; END IF;
  v_dono := coalesce(e.user_id, (SELECT user_id FROM public.clientes WHERE id = e.cliente_id));
  -- O título da edição vale (é o que o vídeo fala); o do card só quando o da
  -- edição é genérico ("Bruto IMG_2030").
  v_titulo := trim(regexp_replace(regexp_replace(e.titulo, '^\s*Piloto\s*[—–-]\s*', ''), '\s*\(IMG_[0-9]+\)\s*$', ''));
  IF v_titulo = '' OR v_titulo ~* '^bruto\M' THEN
    v_titulo := coalesce(nullif(trim((SELECT titulo FROM public.videos_vertical WHERE id = e.video_vertical_id)), ''), e.titulo);
  END IF;
  INSERT INTO public.reels (cliente_id, user_id, edicao_id, video_vertical_id, titulo, final_drive, duracao)
  VALUES (e.cliente_id, v_dono, e.id, e.video_vertical_id, v_titulo, e.final_drive, e.duracao)
  RETURNING id INTO v_reel;

  SELECT * INTO v_dalila FROM public.membros
    WHERE cliente_id = e.cliente_id AND ativo AND (lower(nome) = 'dalila' OR funcao ILIKE '%social%')
    ORDER BY (lower(nome) = 'dalila') DESC LIMIT 1;
  IF v_dalila.id IS NOT NULL THEN
    UPDATE public.reels SET atividade_id = public.dalila_tarefa(e.cliente_id, v_dono, v_dalila,
      'Programar reel: ' || v_titulo, 'programacao', 'media',
      'Edição do Danilo aprovada pelo Davi. A Dalila prepara o vídeo e a legenda; publica no dia e hora que o Davi escolher.', NULL)
    WHERE id = v_reel;
  END IF;
  RETURN v_reel;
END;
$$;
REVOKE ALL ON FUNCTION public.reel_da_edicao(uuid) FROM public, anon, authenticated;

CREATE FUNCTION public.edicao_aprovada_reel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.reel_da_edicao(NEW.id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER edicao_aprovada_reel AFTER UPDATE OF status ON public.edicoes_video
  FOR EACH ROW WHEN (NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado')
  EXECUTE FUNCTION public.edicao_aprovada_reel();

-- 2. Vídeo e legenda prontos → tarefa "Escolher data do reel" do Davi.
CREATE FUNCTION public.reel_pronto_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_davi public.membros;
BEGIN
  IF NEW.tarefa_data_id IS NOT NULL OR NEW.programado_para IS NOT NULL THEN RETURN NULL; END IF;
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
CREATE TRIGGER reel_pronto_tarefa AFTER UPDATE OF status ON public.reels
  FOR EACH ROW WHEN (NEW.status = 'pronto' AND OLD.status IS DISTINCT FROM 'pronto')
  EXECUTE FUNCTION public.reel_pronto_tarefa();

-- 3. Nunca no perfil errado (mesma regra do carrossel).
CREATE FUNCTION public.reel_confere_instagram()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('programado', 'publicando') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND public.dalila_conexao_do_projeto(NEW.cliente_id) IS NULL THEN
    RAISE EXCEPTION 'Este projeto não tem Instagram conectado: a Dalila não publica no perfil de outro projeto. Conecte o Instagram dele primeiro.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reel_confere_instagram BEFORE INSERT OR UPDATE OF status ON public.reels
  FOR EACH ROW EXECUTE FUNCTION public.reel_confere_instagram();

-- 4. O Davi escolhe a data e confirma a legenda; desmarca; cancela.
CREATE FUNCTION public.programar_reel(p_reel uuid, p_quando timestamptz, p_legenda text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('reels', to_jsonb(r), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Reel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.ig_media_id IS NOT NULL OR r.status NOT IN ('pronto', 'programado') THEN
    RAISE EXCEPTION 'Esse reel não pode ser programado agora (%).', r.status;
  END IF;
  IF r.video_url IS NULL THEN RAISE EXCEPTION 'O vídeo ainda não está pronto para publicar.'; END IF;
  IF nullif(trim(coalesce(p_legenda, '')), '') IS NULL THEN RAISE EXCEPTION 'Escreva a legenda do reel.'; END IF;
  IF length(p_legenda) > 2200 THEN RAISE EXCEPTION 'A legenda passa de 2.200 caracteres (limite do Instagram).'; END IF;
  IF p_quando IS NULL OR p_quando < now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'Escolha um horário no futuro.';
  END IF;
  UPDATE public.reels SET status = 'programado', programado_para = p_quando, legenda = trim(p_legenda),
    publicacao_tentativas = 0, ig_container_id = NULL, ig_container_em = NULL, publicacao_trava_ate = NULL,
    mensagem = 'Dalila publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    atualizado_em = now()
  WHERE id = r.id;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida' WHERE id = r.tarefa_data_id;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida',
    observacao = 'Programado: publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    data_vencimento = (p_quando AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = r.atividade_id;
END;
$$;

CREATE FUNCTION public.desprogramar_reel(p_reel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('reels', to_jsonb(r), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Reel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'programado' OR r.ig_media_id IS NOT NULL THEN
    RAISE EXCEPTION 'Só dá para desmarcar um reel programado que ainda não começou a sair.';
  END IF;
  UPDATE public.reels SET status = 'pronto', programado_para = NULL, mensagem = NULL, atualizado_em = now() WHERE id = r.id;
  UPDATE public.atividades SET concluida = false, situacao = 'fila' WHERE id = r.tarefa_data_id;
  UPDATE public.atividades SET concluida = false, situacao = 'fila', data_vencimento = NULL, observacao = NULL WHERE id = r.atividade_id;
END;
$$;

CREATE FUNCTION public.cancelar_reel(p_reel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('reels', to_jsonb(r), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Reel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.status IN ('publicando', 'publicado') THEN RAISE EXCEPTION 'Esse reel já está saindo ou já saiu.'; END IF;
  UPDATE public.reels SET status = 'cancelado', mensagem = 'Cancelado pelo Davi', atualizado_em = now() WHERE id = r.id;
  UPDATE public.atividades SET deleted_at = now() WHERE id IN (r.atividade_id, r.tarefa_data_id);
END;
$$;
REVOKE ALL ON FUNCTION public.programar_reel(uuid, timestamptz, text), public.desprogramar_reel(uuid), public.cancelar_reel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.programar_reel(uuid, timestamptz, text), public.desprogramar_reel(uuid), public.cancelar_reel(uuid) TO authenticated;

-- 5. A nuvem pega um reel por vez, já na hora (trava de 4 min: vídeo demora).
CREATE FUNCTION public.dalila_proximo_reel()
RETURNS SETOF public.reels LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.reels r SET publicacao_trava_ate = now() + interval '4 minutes'
  WHERE r.id = (
    SELECT id FROM public.reels
    WHERE status IN ('programado', 'publicando') AND ig_media_id IS NULL AND programado_para <= now()
      AND (publicacao_trava_ate IS NULL OR publicacao_trava_ate < now())
    ORDER BY programado_para LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING r.*;
$$;
REVOKE ALL ON FUNCTION public.dalila_proximo_reel() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dalila_proximo_reel() TO service_role;

-- 6. Bucket público `reels`: <cliente>/<reel>/<token>/reel.mp4, só enquanto
-- 'preparando' e com o token certo (o Mac não tem chave de servidor).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reels', 'reels', true, 52428800, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.reel_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR caminho !~ '/reel-v[0-9]+\.mp4$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.cliente_id = partes[1]::uuid AND r.id = partes[2]::uuid AND r.token_envio = partes[3]::uuid
      AND r.status = 'preparando');
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.reel_envio_permitido(text) FROM public;
GRANT EXECUTE ON FUNCTION public.reel_envio_permitido(text) TO anon, authenticated;

CREATE POLICY "Reels são públicos para leitura" ON storage.objects FOR SELECT USING (bucket_id = 'reels');
CREATE POLICY "Dalila envia o reel em preparo" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'reels' AND public.reel_envio_permitido(name));

-- 7. O piloto já aprovado (e qualquer outra edição aprovada) entra na fila.
SELECT public.reel_da_edicao(id) FROM public.edicoes_video WHERE status = 'aprovado';

NOTIFY pgrst, 'reload schema';
