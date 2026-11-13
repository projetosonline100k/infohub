-- Instagram do perfil dark (13/11/2026, Davi: "nesse perfil dark eu preciso ter a opção de conectar um instagram para ele já programar o vídeo e postar").
-- Mesmo processo da Dalila: o perfil dark conecta a conta pelo OAuth do Hub; o vídeo aprovado sobe comprimido para o bucket `reels`;
-- o Davi escolhe a data e confirma a legenda (= o ok); o pg_cron chama a edge `lauro-publicar` a cada minuto, que cria o container,
-- espera a Meta processar e publica. Nunca publica sem a data escolhida pelo Davi.
ALTER TABLE public.instagram_conexoes ADD COLUMN perfil_dark_id uuid REFERENCES public.esteira_dark_perfis(id) ON DELETE SET NULL;
ALTER TABLE public.instagram_oauth_states ADD COLUMN perfil_dark_id uuid REFERENCES public.esteira_dark_perfis(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX instagram_conexoes_perfil_dark_uq ON public.instagram_conexoes (perfil_dark_id) WHERE perfil_dark_id IS NOT NULL;

ALTER TABLE public.esteira_dark_roteiros DROP CONSTRAINT esteira_dark_roteiros_status_check;
ALTER TABLE public.esteira_dark_roteiros ADD CONSTRAINT esteira_dark_roteiros_status_check
  CHECK (status IN ('na_fila', 'editando', 'revisar', 'programando', 'programado', 'publicando', 'publicado', 'erro'));
ALTER TABLE public.esteira_dark_roteiros
  ADD COLUMN legenda text CHECK (legenda IS NULL OR length(legenda) <= 2200),
  ADD COLUMN video_url text,               -- cópia comprimida no bucket público `reels` (sai depois de publicar)
  ADD COLUMN video_caminho text,
  ADD COLUMN token_envio uuid DEFAULT gen_random_uuid(),   -- o Mac sobe o vídeo só com ele (o app não lê)
  ADD COLUMN programado_para timestamptz,
  ADD COLUMN ig_container_id text,
  ADD COLUMN ig_container_em timestamptz,
  ADD COLUMN ig_media_id text,
  ADD COLUMN permalink text,
  ADD COLUMN publicado_em timestamptz,
  ADD COLUMN publicacao_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN publicacao_trava_ate timestamptz,
  ADD COLUMN mensagem text;
-- O app lê tudo, menos o token de envio.
REVOKE SELECT ON public.esteira_dark_roteiros FROM authenticated;
GRANT SELECT (id, perfil_id, user_id, numero, titulo, texto, data_postagem, status, arquivo, obs, criado_em, atualizado_em, versoes,
  legenda, video_url, video_caminho, programado_para, ig_media_id, permalink, publicado_em, mensagem) ON public.esteira_dark_roteiros TO authenticated;

-- Instagram conectado ao perfil (o app só vê o @, nunca o token).
CREATE FUNCTION public.dark_instagram_do_perfil(p_perfil uuid)
RETURNS TABLE (ig_user_id text, username text, token_expira_em timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.ig_user_id, c.username, c.token_expira_em FROM public.instagram_conexoes c
  JOIN public.esteira_dark_perfis p ON p.id = c.perfil_dark_id
  WHERE c.perfil_dark_id = p_perfil AND public.team_row_allowed('esteira_dark_perfis', to_jsonb(p.*), 'conteudo', 'acessar');
$$;
CREATE FUNCTION public.dark_desconectar_instagram(p_perfil uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.esteira_dark_perfis;
BEGIN
  SELECT * INTO p FROM public.esteira_dark_perfis WHERE id = p_perfil;
  IF p.id IS NULL OR NOT public.team_row_allowed('esteira_dark_perfis', to_jsonb(p), 'conteudo', 'editar') THEN
    RAISE EXCEPTION 'Perfil não encontrado' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.esteira_dark_roteiros WHERE perfil_id = p_perfil AND status IN ('programado', 'publicando')) THEN
    RAISE EXCEPTION 'Há vídeo programado neste perfil: desmarque antes de desconectar.';
  END IF;
  DELETE FROM public.instagram_conexoes WHERE perfil_dark_id = p_perfil;
END; $$;

-- O Davi escolhe a data e confirma a legenda (= o ok para publicar).
CREATE FUNCTION public.programar_roteiro_dark(p_roteiro uuid, p_quando timestamptz, p_legenda text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.esteira_dark_roteiros; p public.esteira_dark_perfis;
BEGIN
  SELECT * INTO r FROM public.esteira_dark_roteiros WHERE id = p_roteiro FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('esteira_dark_roteiros', to_jsonb(r), 'conteudo', 'editar') THEN
    RAISE EXCEPTION 'Roteiro não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.ig_media_id IS NOT NULL OR r.status NOT IN ('programando', 'programado', 'erro') THEN
    RAISE EXCEPTION 'Esse vídeo não pode ser programado agora (%).', r.status;
  END IF;
  IF r.video_url IS NULL THEN RAISE EXCEPTION 'O vídeo ainda não está pronto para publicar.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.instagram_conexoes WHERE perfil_dark_id = r.perfil_id) THEN
    RAISE EXCEPTION 'Conecte o Instagram deste perfil antes de programar.';
  END IF;
  IF nullif(trim(coalesce(p_legenda, '')), '') IS NULL THEN RAISE EXCEPTION 'Escreva a legenda.'; END IF;
  IF length(p_legenda) > 2200 THEN RAISE EXCEPTION 'A legenda passa de 2.200 caracteres (limite do Instagram).'; END IF;
  IF p_quando IS NULL OR p_quando < now() + interval '2 minutes' THEN RAISE EXCEPTION 'Escolha um horário no futuro.'; END IF;
  UPDATE public.esteira_dark_roteiros SET status = 'programado', programado_para = p_quando, legenda = trim(p_legenda),
    publicacao_tentativas = 0, ig_container_id = NULL, ig_container_em = NULL, publicacao_trava_ate = NULL,
    mensagem = 'Publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    data_postagem = (p_quando AT TIME ZONE 'America/Sao_Paulo')::date, atualizado_em = now()
  WHERE id = r.id;
END; $$;
CREATE FUNCTION public.desprogramar_roteiro_dark(p_roteiro uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.esteira_dark_roteiros;
BEGIN
  SELECT * INTO r FROM public.esteira_dark_roteiros WHERE id = p_roteiro FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('esteira_dark_roteiros', to_jsonb(r), 'conteudo', 'editar') THEN
    RAISE EXCEPTION 'Roteiro não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'programado' OR r.ig_media_id IS NOT NULL THEN
    RAISE EXCEPTION 'Só dá para desmarcar um vídeo programado que ainda não começou a sair.';
  END IF;
  UPDATE public.esteira_dark_roteiros SET status = 'programando', programado_para = NULL, mensagem = NULL, atualizado_em = now() WHERE id = r.id;
END; $$;
REVOKE ALL ON FUNCTION public.dark_instagram_do_perfil(uuid), public.dark_desconectar_instagram(uuid),
  public.programar_roteiro_dark(uuid, timestamptz, text), public.desprogramar_roteiro_dark(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dark_instagram_do_perfil(uuid), public.dark_desconectar_instagram(uuid),
  public.programar_roteiro_dark(uuid, timestamptz, text), public.desprogramar_roteiro_dark(uuid) TO authenticated;

-- Fila da edge `lauro-publicar` (service role): um por vez, com trava de 4 min.
CREATE FUNCTION public.lauro_proximo_roteiro() RETURNS SETOF public.esteira_dark_roteiros LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.esteira_dark_roteiros r SET publicacao_trava_ate = now() + interval '4 minutes'
  WHERE r.id = (
    SELECT id FROM public.esteira_dark_roteiros
    WHERE status IN ('programado', 'publicando') AND ig_media_id IS NULL AND programado_para <= now()
      AND (publicacao_trava_ate IS NULL OR publicacao_trava_ate < now())
    ORDER BY programado_para LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING r.*;
$$;
REVOKE ALL ON FUNCTION public.lauro_proximo_roteiro() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lauro_proximo_roteiro() TO service_role;

-- O Mac sobe o vídeo aprovado: <perfil>/<roteiro>/<token>/reel-vN.mp4, só enquanto 'programando' e com o token certo.
CREATE FUNCTION public.dark_envio_permitido(caminho text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR caminho !~ '/reel-v[0-9]+\.mp4$' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.esteira_dark_roteiros r
    WHERE r.perfil_id = partes[1]::uuid AND r.id = partes[2]::uuid AND r.token_envio = partes[3]::uuid AND r.status = 'programando');
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.dark_envio_permitido(text) FROM public;
GRANT EXECUTE ON FUNCTION public.dark_envio_permitido(text) TO anon, authenticated;
CREATE POLICY "Lauro envia o vídeo aprovado" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'reels' AND public.dark_envio_permitido(name));

-- A cada minuto, o pg_cron chama o Lauro na nuvem (mesma chave do Vault da Dalila).
SELECT cron.schedule('lauro-publicar', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/lauro-publicar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dalila-chave',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dalila_publicar')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$cron$);
NOTIFY pgrst, 'reload schema';
