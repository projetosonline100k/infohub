-- Shorts no YouTube pela Dalila (pedido do Davi, 16/10/2026: "quero postar no
-- youtube, no começo vai ser shorts, depois faremos vídeos longos; já tenho um
-- canal"). Mesmo esquema do reel do Instagram:
--   edição aprovada → reel pronto → o Davi escolhe a data em ProgramarReel e
--   marca "Também no YouTube (Short)" (= o ok dele) → a edge `youtube`
--   (rota /publicar, pg_cron a cada minuto) sobe o mesmo vídeo no canal DO
--   PROJETO na hora marcada e grava o link na tarefa da Dalila.
-- O canal é ligado pelo login Google (edge `youtube`, como a Agenda); os tokens
-- ficam criptografados e o app nunca lê. Vídeo longo fica para a 2ª etapa.

-- 1. O canal de cada projeto (um por projeto; nunca cai no canal de outro).
CREATE TABLE public.youtube_conexoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,          -- quem conectou (o dono do projeto)
  canal_id text NOT NULL,
  canal_titulo text,
  google_email text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expira_em timestamptz NOT NULL,
  escopo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.youtube_conexoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_conexoes FROM anon, authenticated;

CREATE TABLE public.youtube_oauth_estados (
  estado text PRIMARY KEY,
  user_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  voltar_para text,
  expira_em timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
ALTER TABLE public.youtube_oauth_estados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_oauth_estados FROM anon, authenticated;

-- O app só vê o nome do canal do projeto (sem tokens).
CREATE FUNCTION public.youtube_do_projeto(p_cliente uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(nullif(yc.canal_titulo, ''), yc.canal_id) FROM public.youtube_conexoes yc
  WHERE yc.cliente_id = p_cliente
    AND (EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente AND user_id = auth.uid())
         OR public.team_allowed(p_cliente, 'atividades', 'acessar'));
$$;
REVOKE ALL ON FUNCTION public.youtube_do_projeto(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.youtube_do_projeto(uuid) TO authenticated;

-- 2. O Short mora no próprio reel, com estado separado do Instagram (um pode
-- falhar sem travar o outro).
ALTER TABLE public.reels
  ADD COLUMN yt_publicar boolean NOT NULL DEFAULT false,
  ADD COLUMN yt_titulo text,
  ADD COLUMN yt_status text CHECK (yt_status IN ('programado', 'enviando', 'publicado', 'erro')),
  ADD COLUMN yt_programado_para timestamptz,
  ADD COLUMN yt_sessao text,              -- URL do envio retomável do Google (vale 1 semana; não vai para o app)
  ADD COLUMN yt_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN yt_trava_ate timestamptz,
  ADD COLUMN yt_video_id text,
  ADD COLUMN yt_url text,
  ADD COLUMN yt_privacidade text,         -- o que o YouTube devolveu: public / private / unlisted
  ADD COLUMN yt_mensagem text,
  ADD COLUMN yt_publicado_em timestamptz;
GRANT SELECT (yt_publicar, yt_titulo, yt_status, yt_programado_para, yt_video_id, yt_url, yt_privacidade,
  yt_mensagem, yt_publicado_em) ON public.reels TO authenticated;

-- 3. Programar: o mesmo dia e hora do reel; marcar o YouTube é opcional.
DROP FUNCTION public.programar_reel(uuid, timestamptz, text);
CREATE FUNCTION public.programar_reel(p_reel uuid, p_quando timestamptz, p_legenda text,
  p_youtube boolean DEFAULT false, p_yt_titulo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reels; v_titulo text := trim(coalesce(p_yt_titulo, ''));
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
  IF r.yt_status = 'enviando' THEN RAISE EXCEPTION 'O Short deste reel já está subindo no YouTube.'; END IF;
  IF coalesce(p_youtube, false) AND r.yt_video_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.youtube_conexoes WHERE cliente_id = r.cliente_id) THEN
      RAISE EXCEPTION 'Este projeto não tem canal do YouTube conectado.';
    END IF;
    IF v_titulo = '' THEN RAISE EXCEPTION 'Escreva o título do Short.'; END IF;
    IF length(v_titulo) > 100 THEN RAISE EXCEPTION 'O título do Short passa de 100 caracteres (limite do YouTube).'; END IF;
    IF v_titulo ~ '[<>]' THEN RAISE EXCEPTION 'O YouTube não aceita < ou > no título.'; END IF;
  END IF;
  UPDATE public.reels SET status = 'programado', programado_para = p_quando, legenda = trim(p_legenda),
    publicacao_tentativas = 0, ig_container_id = NULL, ig_container_em = NULL, publicacao_trava_ate = NULL,
    mensagem = 'Dalila publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    atualizado_em = now()
  WHERE id = r.id;
  -- Short já publicado não sobe de novo; senão segue o que o Davi marcou.
  IF r.yt_video_id IS NULL THEN
    IF coalesce(p_youtube, false) THEN
      UPDATE public.reels SET yt_publicar = true, yt_titulo = v_titulo, yt_status = 'programado',
        yt_programado_para = p_quando, yt_tentativas = 0, yt_sessao = NULL, yt_trava_ate = NULL,
        yt_mensagem = 'Short no YouTube em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
      WHERE id = r.id;
    ELSE
      UPDATE public.reels SET yt_publicar = false, yt_status = NULL, yt_programado_para = NULL, yt_sessao = NULL,
        yt_mensagem = NULL WHERE id = r.id;
    END IF;
  END IF;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida' WHERE id = r.tarefa_data_id;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida',
    observacao = 'Programado: publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
      || CASE WHEN coalesce(p_youtube, false) AND r.yt_video_id IS NULL THEN ' (Instagram e YouTube)' ELSE '' END,
    data_vencimento = (p_quando AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = r.atividade_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.desprogramar_reel(p_reel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('reels', to_jsonb(r), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Reel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'programado' OR r.ig_media_id IS NOT NULL OR r.yt_status = 'enviando' THEN
    RAISE EXCEPTION 'Só dá para desmarcar um reel programado que ainda não começou a sair.';
  END IF;
  UPDATE public.reels SET status = 'pronto', programado_para = NULL, mensagem = NULL, atualizado_em = now(),
    yt_status = CASE WHEN yt_status = 'programado' THEN NULL ELSE yt_status END,
    yt_programado_para = CASE WHEN yt_status = 'programado' THEN NULL ELSE yt_programado_para END,
    yt_mensagem = CASE WHEN yt_status = 'programado' THEN NULL ELSE yt_mensagem END
  WHERE id = r.id;
  UPDATE public.atividades SET concluida = false, situacao = 'fila' WHERE id = r.tarefa_data_id;
  UPDATE public.atividades SET concluida = false, situacao = 'fila', data_vencimento = NULL, observacao = NULL WHERE id = r.atividade_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_reel(p_reel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = p_reel FOR UPDATE;
  IF r.id IS NULL OR NOT public.team_row_allowed('reels', to_jsonb(r), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Reel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF r.status IN ('publicando', 'publicado') OR r.yt_status = 'enviando' THEN RAISE EXCEPTION 'Esse reel já está saindo ou já saiu.'; END IF;
  UPDATE public.reels SET status = 'cancelado', mensagem = 'Cancelado pelo Davi', atualizado_em = now(),
    yt_status = CASE WHEN yt_status = 'programado' THEN NULL ELSE yt_status END
  WHERE id = r.id;
  UPDATE public.atividades SET deleted_at = now() WHERE id IN (r.atividade_id, r.tarefa_data_id);
END;
$$;
REVOKE ALL ON FUNCTION public.programar_reel(uuid, timestamptz, text, boolean, text), public.desprogramar_reel(uuid), public.cancelar_reel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.programar_reel(uuid, timestamptz, text, boolean, text), public.desprogramar_reel(uuid), public.cancelar_reel(uuid) TO authenticated;

-- 4. A nuvem pega um Short por vez, já na hora (trava de 4 min).
CREATE FUNCTION public.dalila_proximo_short()
RETURNS SETOF public.reels LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.reels r SET yt_trava_ate = now() + interval '4 minutes'
  WHERE r.id = (
    SELECT id FROM public.reels
    WHERE yt_status IN ('programado', 'enviando') AND yt_video_id IS NULL AND yt_programado_para <= now()
      AND status <> 'cancelado' AND (yt_trava_ate IS NULL OR yt_trava_ate < now())
    ORDER BY yt_programado_para LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING r.*;
$$;

-- Os links (Instagram e YouTube) na tarefa da Dalila, sem um apagar o outro.
CREATE FUNCTION public.reel_links_na_tarefa(p_reel uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.atividades a SET observacao = concat_ws(E'\n',
      CASE WHEN r.permalink IS NOT NULL THEN 'Instagram: ' || r.permalink END,
      CASE WHEN r.yt_url IS NOT NULL THEN 'YouTube: ' || r.yt_url
        || CASE WHEN r.yt_privacidade IS DISTINCT FROM 'public' THEN ' (saiu ' || coalesce(r.yt_privacidade, '?') || ')' ELSE '' END END,
      CASE WHEN r.yt_status = 'erro' THEN r.yt_mensagem END)
  FROM public.reels r WHERE r.id = p_reel AND a.id = r.atividade_id;
$$;
REVOKE ALL ON FUNCTION public.dalila_proximo_short(), public.reel_links_na_tarefa(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dalila_proximo_short(), public.reel_links_na_tarefa(uuid) TO service_role;

-- 5. A cada minuto, o pg_cron chama a parte do YouTube (mesma chave do Vault
-- da dalila-publicar, conferida por dalila_chave_ok).
SELECT cron.schedule('dalila-youtube', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/youtube/publicar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dalila-chave',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dalila_publicar')),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000);
$cron$);

NOTIFY pgrst, 'reload schema';
