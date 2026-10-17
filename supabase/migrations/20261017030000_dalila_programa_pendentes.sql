-- Davi (17/10/2026), sobre os "Escolher data" que já estavam na lista dele antes da
-- Dalila programar sozinha: "como eu não preciso mais programar, pode até sair daí,
-- para ir para a Dalila". Cada reel pronto / carrossel aprovado que ainda esperava a
-- data do Davi: a tarefa dele sai (lixeira) e a Dalila programa no 1º dia livre.
DO $$
DECLARE r record; v_tarefa uuid;
BEGIN
  FOR r IN SELECT re.id, re.tarefa_data_id FROM public.reels re
            JOIN public.atividades a ON a.id = re.tarefa_data_id
           WHERE re.status = 'pronto' AND re.programado_para IS NULL AND NOT a.concluida AND a.deleted_at IS NULL
           ORDER BY re.criado_em
  LOOP
    UPDATE public.reels SET tarefa_data_id = NULL WHERE id = r.id;
    IF public.dalila_programar_reel_sozinha(r.id) THEN
      UPDATE public.atividades SET deleted_at = now() WHERE id = r.tarefa_data_id;
    ELSE
      UPDATE public.reels SET tarefa_data_id = r.tarefa_data_id WHERE id = r.id;   -- não deu: continua com o Davi
    END IF;
  END LOOP;
  FOR r IN SELECT c.id, c.tarefa_data_id FROM public.carrosseis c
            JOIN public.atividades a ON a.id = c.tarefa_data_id
           WHERE c.status = 'aprovado' AND c.programado_para IS NULL AND NOT a.concluida AND a.deleted_at IS NULL
           ORDER BY c.numero
  LOOP
    UPDATE public.carrosseis SET tarefa_data_id = NULL WHERE id = r.id;
    IF public.dalila_programar_carrossel_sozinha(r.id) THEN
      UPDATE public.atividades SET deleted_at = now() WHERE id = r.tarefa_data_id;
    ELSE
      UPDATE public.carrosseis SET tarefa_data_id = r.tarefa_data_id WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
