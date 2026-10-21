-- Semana de 21 a 25/10 sem carrossel (pedido do Davi, 20/10/2026): "os carrosséis
-- antigos não estão trazendo muito resultado ... pegue os vídeos dark e coloque no
-- lugar essa semana, até domingo. Então serão 2 darks por dia e 1 normal".
-- Combinado com a Dalila: os carrosséis 018, 019, 020, 021 e 027 saem da agenda e
-- voltam para aprovados (guardados, sem apagar); os darks de 26 a 30/10 vêm para
-- 21 a 25/10 às 10h. O dark das 12h e o reel das 18h ficam como estão. Da segunda
-- (26) em diante, os carrosséis seguem como estão.

-- 1. Carrossel não cai num dia que já tem reel às 10h (o horário dele). Sem isso,
-- o próximo carrossel aprovado iria sozinho para 21/10 às 10h, junto do dark.
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
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.reels WHERE cliente_id = p_cliente
        AND status IN ('programado', 'publicando', 'publicado')
        AND coalesce(publicado_em, programado_para) = v_quando);
    END IF;
    RETURN v_quando;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.dalila_proximo_horario(uuid, text) FROM public, anon, authenticated;

-- 2. Os 5 carrosséis da semana voltam para aprovados, sem data. As tarefas ficam
-- concluídas (não reabre "Escolher data" para o Davi: estão guardados de propósito).
DO $$
DECLARE
  c public.carrosseis;
  v_txt text := 'Guardado: saiu da semana de 21 a 25/10 (pedido do Davi, 20/10), no lugar entrou um vídeo dark. Para usar, peça à Dalila uma nova data.';
BEGIN
  FOR c IN SELECT * FROM public.carrosseis
    WHERE id IN ('b2cff22c-cb86-486d-88f0-1f1396d0aca3', '7cf5f50d-493d-4fcc-bdc9-3c1b19a12af9',
      '5eb90773-dd4c-4918-af56-6c7c35d27755', '9dfadc34-b622-46f1-b854-1bd47b3710de', '30f08a0d-f90a-4aca-b01d-b7b0c643e98c')
      AND status = 'programado' AND ig_media_id IS NULL AND programado_para > now() + interval '2 minutes'
    FOR UPDATE
  LOOP
    UPDATE public.carrosseis SET status = 'aprovado', programado_para = NULL, ig_container_id = NULL,
      publicacao_tentativas = 0, publicacao_trava_ate = NULL, mensagem = v_txt, atualizado_em = now()
    WHERE id = c.id;
    UPDATE public.atividades SET observacao = v_txt WHERE id IN (c.tarefa_data_id, c.atividade_id);
  END LOOP;
END $$;

-- 3. Os darks de 26 a 30/10 passam para 21 a 25/10 às 10h (mesma ordem).
DO $$
DECLARE
  r public.reels;
  v_quando timestamptz;
  v_txt text;
  m record;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('57009420-de56-4d39-8321-32943794a8d5'::uuid, date '2026-10-21'),
    ('72920993-c49e-4d40-955f-a884b6de4298'::uuid, date '2026-10-22'),
    ('75408a9a-349b-4d94-95cc-2a91a493ec2a'::uuid, date '2026-10-23'),
    ('656c4434-4b24-4158-b9f3-d3c16aa172d1'::uuid, date '2026-10-24'),
    ('2ff79795-6ebd-47c0-9a91-53ea4d8c7b20'::uuid, date '2026-10-25')) AS t(reel, dia)
  LOOP
    v_quando := (m.dia + time '10:00') AT TIME ZONE 'America/Sao_Paulo';
    CONTINUE WHEN v_quando < now() + interval '10 minutes';
    SELECT * INTO r FROM public.reels WHERE id = m.reel AND status = 'programado' AND ig_media_id IS NULL FOR UPDATE;
    CONTINUE WHEN r.id IS NULL;
    v_txt := to_char(v_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
    UPDATE public.reels SET programado_para = v_quando,
      publicacao_tentativas = 0, ig_container_id = NULL, ig_container_em = NULL, publicacao_trava_ate = NULL,
      mensagem = 'Dalila publica em ' || v_txt || ' (no lugar do carrossel, pedido do Davi)', atualizado_em = now()
    WHERE id = r.id;
    UPDATE public.atividades SET
      descricao = 'Programado para ' || v_txt || ': nesta semana o dark entra no horário do carrossel (pedido do Davi, 20/10). '
        || 'Para mudar o dia ou a legenda, clique no reel em Conteúdo → Visão geral → Programados (até a hora do post).',
      observacao = 'Programado para ' || v_txt, data_vencimento = m.dia, data_atividade = m.dia
    WHERE id = r.tarefa_data_id;
    UPDATE public.atividades SET observacao = 'Programado: publica em ' || v_txt, data_vencimento = m.dia
    WHERE id = r.atividade_id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
