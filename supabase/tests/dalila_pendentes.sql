-- Depois de passar os pendentes para a Dalila, nenhum reel pronto / carrossel aprovado do
-- projeto Davi Queiroz com Instagram ligado fica esperando "Escolher data" aberto.
BEGIN;
DO $$ BEGIN
  IF public.dalila_programa_sozinha_ligada() AND EXISTS (
    SELECT 1 FROM public.reels re JOIN public.atividades a ON a.id = re.tarefa_data_id
     WHERE re.cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND re.status = 'pronto' AND NOT a.concluida AND a.deleted_at IS NULL
       AND nullif(trim(coalesce(re.legenda, '')), '') IS NOT NULL AND re.video_url IS NOT NULL AND re.programado_pela_dalila_em IS NULL) THEN
    RAISE EXCEPTION 'ainda tem reel pronto esperando a data do Davi';
  END IF;
END $$;
ROLLBACK;
