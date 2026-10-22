-- Fora o modelo antigo (pedido do Davi, 22/10/2026): "aqueles carrosséis que você
-- programou para hoje às 14 horas, eu não quero mais eles, agora são nos novos
-- modelos de desenho ... esses aí pode passar para o Roy refazer. E aí já pega
-- algum carrossel que está programado para frente e coloque para hoje às 14 horas".
-- Combinado com a Dalila:
-- 1. 018, 019, 020 e 021 (Clássico marfim) saem da agenda e voltam para o Roy
--    refazer no Caderno preto (status 'ajuste' com o pedido escrito: o serviço do
--    Roy pega sozinho, remonta e manda para a revisão do Davi).
-- 2. Os do Caderno preto sobem, 1 por dia às 14h: 22/10 024, 23/10 026, 24/10 023,
--    25/10 022, 26/10 028, 27/10 027.

-- 1. Os 4 do modelo antigo voltam para o Roy.
DO $$
DECLARE
  c public.carrosseis;
  v_txt text := 'Saiu da programação em 22/10 (pedido do Davi: modelo antigo Clássico marfim). Voltou para o Roy refazer no Caderno preto; depois de aprovado, a Dalila programa de novo.';
BEGIN
  FOR c IN SELECT * FROM public.carrosseis
    WHERE id IN ('b2cff22c-cb86-486d-88f0-1f1396d0aca3', '7cf5f50d-493d-4fcc-bdc9-3c1b19a12af9',
      '5eb90773-dd4c-4918-af56-6c7c35d27755', '9dfadc34-b622-46f1-b854-1bd47b3710de')
      AND status IN ('aprovado', 'programado') AND ig_media_id IS NULL
      AND (programado_para IS NULL OR programado_para > now() + interval '2 minutes')
    FOR UPDATE
  LOOP
    UPDATE public.carrosseis SET status = 'ajuste', aprovar_apos_ajuste = false,
      feedback = 'Refazer no estilo Caderno preto (o padrão desde 20/10, como o 024 e o 027): no conteudo.json "estilo": "caderno-preto" '
        || 'e, em cada página, um "rabisco" ou a "capa" real no lugar da escultura. Mesmos textos e mesma legenda; '
        || 'só muda o modelo. (Pedido do Davi, 22/10: o modelo antigo não sai mais.)',
      programado_para = NULL, programado_pela_dalila_em = NULL, ig_container_id = NULL, ig_container_em = NULL,
      paginas_jpg = '{}', publicacao_tentativas = 0, publicacao_trava_ate = NULL,
      mensagem = 'Voltou para o Roy refazer no Caderno preto (pedido do Davi, 22/10).', atualizado_em = now()
    WHERE id = c.id;
    UPDATE public.atividades SET observacao = v_txt WHERE id IN (c.tarefa_data_id, c.atividade_id);
  END LOOP;
END $$;

-- 2. O Caderno preto sobe para não ficar dia vazio. Pula o dia que já passou (ou
-- falta menos de 10 min) e o carrossel que não está pronto para publicar.
DO $$
DECLARE
  c public.carrosseis;
  v_quando timestamptz;
  v_txt text;
  m record;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('de967a1f-298b-4f73-8a35-bdff7949b88b'::uuid, date '2026-10-22'),  -- 024
    ('586e488c-3eb0-4c6d-93d3-2036a52a01aa'::uuid, date '2026-10-23'),  -- 026
    ('204bbdc2-2ff9-4503-8ba4-47eef0f73812'::uuid, date '2026-10-24'),  -- 023
    ('99a8c297-33d0-4023-819e-7965062dbea5'::uuid, date '2026-10-25'),  -- 022
    ('76ab4c9f-617d-44f7-a074-6a01261e0107'::uuid, date '2026-10-26'),  -- 028
    ('30f08a0d-f90a-4aca-b01d-b7b0c643e98c'::uuid, date '2026-10-27')) AS t(carrossel, dia)  -- 027
  LOOP
    v_quando := (m.dia + time '14:00') AT TIME ZONE 'America/Sao_Paulo';
    CONTINUE WHEN v_quando < now() + interval '10 minutes';
    SELECT * INTO c FROM public.carrosseis WHERE id = m.carrossel AND status IN ('aprovado', 'programado')
      AND ig_media_id IS NULL AND cardinality(paginas) > 0 AND nullif(trim(coalesce(legenda, '')), '') IS NOT NULL
      FOR UPDATE;
    CONTINUE WHEN c.id IS NULL;
    v_txt := to_char(v_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
    UPDATE public.carrosseis SET status = 'programado', programado_para = v_quando, publicacao_tentativas = 0,
      ig_container_id = NULL, ig_container_em = NULL, paginas_jpg = '{}', publicacao_trava_ate = NULL,
      programado_pela_dalila_em = now(), mensagem = 'Dalila publica em ' || v_txt || ' (subiu no lugar do modelo antigo, pedido do Davi)',
      atualizado_em = now()
    WHERE id = c.id;
    UPDATE public.atividades SET concluida = true, situacao = 'concluida',
      observacao = 'Programado para ' || v_txt || ' (subiu no lugar do modelo antigo, pedido do Davi, 22/10)',
      data_vencimento = m.dia
    WHERE id = c.tarefa_data_id;
    UPDATE public.atividades SET concluida = true, situacao = 'concluida',
      observacao = 'Programado: publica em ' || v_txt, data_vencimento = m.dia
    WHERE id = c.atividade_id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
