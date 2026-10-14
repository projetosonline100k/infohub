-- Dalila (social media, IA) programa e publica os carrosséis aprovados no
-- Instagram, na nuvem (docs/agentes/dalila-programacao.md):
--   aprovado → o Davi recebe a tarefa "Escolher data" → programado (data e
--   hora escolhidas por ele = o ok para publicar) → publicando → publicado.
-- A edge function `dalila-publicar` roda a cada minuto pelo pg_cron, mesmo
-- com o Mac desligado. Escolher a data é o único ok: sem data, nada sai.
-- Depende de `carrosseis` (20261014060000_carrosseis_roy, worktree do Roy).

-- 1. A Dalila passa a ser IA (pedido do Davi, 14/10/2026).
UPDATE public.membros SET eh_ia = true, funcao = 'Social media (IA · programação e publicação)'
WHERE id = 'a0492db7-8a2d-49fb-97a1-628cc7cf106e';

-- 2. Programação e publicação no carrossel.
ALTER TABLE public.carrosseis
  ADD COLUMN programado_para timestamptz,
  ADD COLUMN tarefa_data_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL, -- "Escolher data" do Davi
  ADD COLUMN paginas_jpg text[] NOT NULL DEFAULT '{}', -- a Meta só aceita JPEG; mesma ordem de `paginas`
  ADD COLUMN ig_container_id text,       -- CAROUSEL criado na Meta (vale 24h)
  ADD COLUMN ig_container_em timestamptz,
  ADD COLUMN ig_media_id text,           -- o post publicado
  ADD COLUMN permalink text,
  ADD COLUMN publicado_em timestamptz,
  ADD COLUMN publicacao_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN publicacao_trava_ate timestamptz; -- um minuto do cron por vez

ALTER TABLE public.carrosseis DROP CONSTRAINT carrosseis_status_check;
ALTER TABLE public.carrosseis ADD CONSTRAINT carrosseis_status_check
  CHECK (status IN ('produzindo', 'revisar', 'ajuste', 'aprovado', 'programado', 'publicando', 'publicado', 'erro'));

GRANT SELECT (programado_para, tarefa_data_id, ig_media_id, permalink, publicado_em) ON public.carrosseis TO authenticated;

-- 3. Na aprovação (app ou Roy), nascem as tarefas: a da Dalila (se quem
-- aprovou não criou) e a "Escolher data" do Davi.
CREATE FUNCTION public.carrossel_criar_tarefas(p_carrossel uuid)
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
        'programacao', 'Carrossel do Roy aprovado pelo Davi. A Dalila publica no dia e hora que o Davi escolher.')
      RETURNING id INTO v_id;
      UPDATE public.carrosseis SET atividade_id = v_id WHERE id = c.id;
    END IF;
  END IF;

  IF c.tarefa_data_id IS NULL AND c.programado_para IS NULL THEN
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
REVOKE ALL ON FUNCTION public.carrossel_criar_tarefas(uuid) FROM public, anon, authenticated;

CREATE FUNCTION public.carrossel_aprovado_tarefas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.carrossel_criar_tarefas(NEW.id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER carrossel_aprovado_tarefas AFTER UPDATE OF status ON public.carrosseis
  FOR EACH ROW WHEN (NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado')
  EXECUTE FUNCTION public.carrossel_aprovado_tarefas();

-- 4. O Davi escolhe a data (ou desmarca). Precisa poder editar o carrossel.
CREATE FUNCTION public.programar_carrossel(p_carrossel uuid, p_quando timestamptz)
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
  UPDATE public.carrosseis SET status = 'programado', programado_para = p_quando, publicacao_tentativas = 0,
    ig_container_id = NULL, ig_container_em = NULL, paginas_jpg = '{}', publicacao_trava_ate = NULL,
    mensagem = 'Dalila publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    atualizado_em = now()
  WHERE id = c.id;
  UPDATE public.atividades SET concluida = true, situacao = 'concluida' WHERE id = c.tarefa_data_id;
  UPDATE public.atividades SET situacao = 'andamento',
    data_vencimento = (p_quando AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = c.atividade_id;
END;
$$;

CREATE FUNCTION public.desprogramar_carrossel(p_carrossel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE c public.carrosseis;
BEGIN
  SELECT * INTO c FROM public.carrosseis WHERE id = p_carrossel FOR UPDATE;
  IF c.id IS NULL OR NOT public.team_row_allowed('carrosseis', to_jsonb(c), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'Carrossel não encontrado' USING ERRCODE = '42501';
  END IF;
  IF c.status <> 'programado' OR c.ig_media_id IS NOT NULL THEN
    RAISE EXCEPTION 'Só dá para desmarcar um carrossel programado que ainda não começou a sair.';
  END IF;
  UPDATE public.carrosseis SET status = 'aprovado', programado_para = NULL, mensagem = NULL, atualizado_em = now()
  WHERE id = c.id;
  UPDATE public.atividades SET concluida = false, situacao = 'fila' WHERE id = c.tarefa_data_id;
  UPDATE public.atividades SET situacao = 'fila', data_vencimento = NULL WHERE id = c.atividade_id;
END;
$$;
REVOKE ALL ON FUNCTION public.programar_carrossel(uuid, timestamptz), public.desprogramar_carrossel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.programar_carrossel(uuid, timestamptz), public.desprogramar_carrossel(uuid) TO authenticated;

-- 5. A edge function pega um carrossel por vez (trava de 3 min): primeiro
-- os que já passaram da hora, depois os que ainda precisam das páginas em JPEG.
CREATE FUNCTION public.dalila_proximo_carrossel()
RETURNS SETOF public.carrosseis LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.carrosseis c SET publicacao_trava_ate = now() + interval '3 minutes'
  WHERE c.id = (
    SELECT id FROM public.carrosseis
    WHERE status IN ('programado', 'publicando') AND ig_media_id IS NULL
      AND (publicacao_trava_ate IS NULL OR publicacao_trava_ate < now())
      AND (programado_para <= now() OR cardinality(paginas_jpg) < cardinality(paginas))
    ORDER BY (programado_para <= now()) DESC, programado_para
    LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING c.*;
$$;

-- A chave do cron fica no Vault; a função confere sem nunca devolvê-la.
SELECT vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'dalila_publicar',
  'Chave que o pg_cron manda para a edge function dalila-publicar');
CREATE FUNCTION public.dalila_chave_ok(p_chave text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(p_chave, '') <> '' AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'dalila_publicar' AND decrypted_secret = p_chave);
$$;
REVOKE ALL ON FUNCTION public.dalila_proximo_carrossel(), public.dalila_chave_ok(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dalila_proximo_carrossel(), public.dalila_chave_ok(text) TO service_role;

-- 6. A cada minuto, o pg_cron chama a Dalila na nuvem.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule('dalila-publicar', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/dalila-publicar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dalila-chave',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dalila_publicar')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$cron$);

-- 7. O carrossel 011, já aprovado, ganha a tarefa "Escolher data" do Davi.
SELECT public.carrossel_criar_tarefas(id) FROM public.carrosseis WHERE status = 'aprovado';

NOTIFY pgrst, 'reload schema';
