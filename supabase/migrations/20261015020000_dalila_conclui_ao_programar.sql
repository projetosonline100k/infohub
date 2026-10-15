-- Pedido do Davi (15/10/2026): "a partir do momento que programa, já era, a
-- Dalila já fez a parte dela". Programar o carrossel conclui a tarefa dela
-- (antes ficava em andamento até a publicação). Desmarcar a data reabre.
-- O post programado continua aparecendo em Programados / calendário.
CREATE OR REPLACE FUNCTION public.programar_carrossel(p_carrossel uuid, p_quando timestamptz)
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
  UPDATE public.atividades SET concluida = true, situacao = 'concluida',
    observacao = 'Programado: publica em ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    data_vencimento = (p_quando AT TIME ZONE 'America/Sao_Paulo')::date WHERE id = c.atividade_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.desprogramar_carrossel(p_carrossel uuid)
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
  UPDATE public.atividades SET concluida = false, situacao = 'fila', data_vencimento = NULL, observacao = NULL WHERE id = c.atividade_id;
END;
$$;

-- Os já programados: a tarefa da Dalila fica concluída.
UPDATE public.atividades a SET concluida = true, situacao = 'concluida',
  observacao = 'Programado: publica em ' || to_char(c.programado_para AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
FROM public.carrosseis c
WHERE c.atividade_id = a.id AND c.status = 'programado' AND NOT a.concluida;
