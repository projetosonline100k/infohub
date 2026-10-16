-- Tarefa que se repete: quando uma tarefa com `repetir` é concluída, nasce
-- sozinha a próxima cópia (mesmo título, descrição, responsável, prioridade,
-- coluna e checklist desmarcado), no próximo dia da regra.
-- Antes a equipe recriava à mão: "Responder grupos" 15 vezes no Core,
-- "Editar e postar 1 vídeo" 20 vezes no projeto do Davi.
--
-- `repetir`: 'diario' | 'dias_uteis' (seg-sex) | 'semanal' (mesmo dia da
-- semana da data da tarefa) | 'dias' (os dias de `repetir_dias`,
-- 0 = domingo … 6 = sábado, como extract(dow)).
--
-- A regra passa para a cópia nova e sai da concluída: reabrir e concluir de
-- novo não gera outra cópia. Fica no banco (e não no app) para valer em
-- qualquer lugar que conclua: quadro, lista, Atlas, Roy, Danilo.
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS repetir text
    CHECK (repetir IN ('diario', 'dias_uteis', 'semanal', 'dias')),
  ADD COLUMN IF NOT EXISTS repetir_dias smallint[];

CREATE OR REPLACE FUNCTION public.atividade_repete_ao_concluir()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_base date := coalesce(NEW.data_vencimento, NEW.data_inicio, NEW.data_atividade);
  v_dias int[];
  v_dia date;
  v_delta int;
  v_nova uuid;
BEGIN
  v_dias := CASE NEW.repetir
    WHEN 'diario' THEN ARRAY[0, 1, 2, 3, 4, 5, 6]
    WHEN 'dias_uteis' THEN ARRAY[1, 2, 3, 4, 5]
    WHEN 'semanal' THEN ARRAY[extract(dow FROM v_base)::int]
    ELSE NEW.repetir_dias::int[]
  END;
  IF coalesce(array_length(v_dias, 1), 0) = 0 THEN RETURN NEW; END IF;

  -- Próximo dia da regra depois da data da tarefa, e nunca no passado
  -- (tarefa concluída atrasada gera a próxima a partir de hoje).
  v_dia := greatest(v_base + 1, v_hoje);
  WHILE NOT (extract(dow FROM v_dia)::int = ANY (v_dias)) LOOP
    v_dia := v_dia + 1;
  END LOOP;
  v_delta := v_dia - v_base;

  INSERT INTO public.atividades (
    cliente_id, user_id, titulo, descricao, status, prioridade, tempo_estimado,
    destaque, ordem, pasta_id, responsavel_nome, data_vencimento, data_inicio,
    data_atividade, repetir, repetir_dias
  ) VALUES (
    NEW.cliente_id, NEW.user_id, NEW.titulo, NEW.descricao, OLD.status, NEW.prioridade,
    NEW.tempo_estimado, NEW.destaque, NEW.ordem, NEW.pasta_id, NEW.responsavel_nome,
    NEW.data_vencimento + v_delta, NEW.data_inicio + v_delta,
    coalesce(NEW.data_inicio + v_delta, v_dia), NEW.repetir, NEW.repetir_dias
  ) RETURNING id INTO v_nova;

  INSERT INTO public.subtarefas_atividade (atividade_id, titulo, concluida, ordem, user_id)
  SELECT v_nova, s.titulo, false, s.ordem, s.user_id
    FROM public.subtarefas_atividade s
   WHERE s.atividade_id = NEW.id;

  NEW.repetir := NULL;
  NEW.repetir_dias := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atividades_repete_ao_concluir
BEFORE UPDATE ON public.atividades
FOR EACH ROW
WHEN (NEW.concluida AND NOT OLD.concluida AND NEW.repetir IS NOT NULL AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION public.atividade_repete_ao_concluir();
