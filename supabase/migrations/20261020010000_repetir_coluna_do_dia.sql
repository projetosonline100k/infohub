-- Tarefa que repete: a cópia nova vai para a coluna do dia da semana dela, quando o quadro tem
-- colunas por dia (20/10/2026, Davi: "dou check e a atividade some e volta, a mesma").
CREATE OR REPLACE FUNCTION public.atividade_repete_ao_concluir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_base date := coalesce(NEW.data_vencimento, NEW.data_inicio, NEW.data_atividade);
  v_dias int[];
  v_dia date;
  v_delta int;
  v_nova uuid;
  v_status text;
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

  -- Quadro com uma coluna por dia da semana ("Segunda-feira", "Terça-feira"…): a cópia vai para a
  -- coluna do dia dela (20/10/2026: ficava na coluna da concluída e parecia a mesma voltando).
  SELECT c.status_key INTO v_status
    FROM public.colunas_atividade c
   WHERE c.cliente_id IS NOT DISTINCT FROM NEW.cliente_id AND NOT c.eh_conclusao
     AND translate(lower(trim(split_part(c.nome, '-', 1))), 'çáéíóúâêôãõ', 'caeiouaeoao')
         = (ARRAY['domingo','segunda','terca','quarta','quinta','sexta','sabado'])[extract(dow FROM v_dia)::int + 1]
   ORDER BY c.ordem
   LIMIT 1;

  INSERT INTO public.atividades (
    cliente_id, user_id, titulo, descricao, status, prioridade, tempo_estimado,
    destaque, ordem, pasta_id, responsavel_nome, data_vencimento, data_inicio,
    data_atividade, repetir, repetir_dias
  ) VALUES (
    NEW.cliente_id, NEW.user_id, NEW.titulo, NEW.descricao, coalesce(v_status, OLD.status), NEW.prioridade,
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
$function$;
