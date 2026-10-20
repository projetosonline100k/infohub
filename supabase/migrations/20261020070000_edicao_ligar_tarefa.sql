-- Editor de vídeo: ligar a edição à tarefa do chat do Danilo (20/10). O app não tem UPDATE em
-- edicoes_video (quem grava é o Mac); a edição feita pela pasta (sem tarefa) ficava sem chat e o
-- editor criava uma tarefa nova a cada abertura. Esta função liga UMA vez, só para quem pode editar.
CREATE OR REPLACE FUNCTION public.edicao_ligar_tarefa(p_edicao uuid, p_tarefa uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ed public.edicoes_video%ROWTYPE;
  atual uuid;
BEGIN
  SELECT * INTO ed FROM public.edicoes_video WHERE id = p_edicao;
  IF NOT FOUND OR NOT public.team_row_allowed('edicoes_video', to_jsonb(ed), 'atividades', 'editar') THEN
    RAISE EXCEPTION 'sem acesso a esta edição' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.atividades a WHERE a.id = p_tarefa AND a.cliente_id = ed.cliente_id AND a.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'tarefa não é deste projeto' USING ERRCODE = '22023';
  END IF;
  UPDATE public.edicoes_video SET atividade_id = p_tarefa WHERE id = p_edicao AND atividade_id IS NULL;
  SELECT atividade_id INTO atual FROM public.edicoes_video WHERE id = p_edicao;
  RETURN atual;   -- a que ficou ligada (se outra já estava, devolve a outra)
END $$;
REVOKE ALL ON FUNCTION public.edicao_ligar_tarefa(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.edicao_ligar_tarefa(uuid, uuid) TO authenticated;

-- Correção do caso de 20/10 (Instalivros, reel 01): liga a edição à tarefa em que o Davi já conversou
-- e tira as duas tarefas vazias criadas a mais.
UPDATE public.edicoes_video SET atividade_id = '83b64a72-9624-46a4-b106-bc25a511043a'
 WHERE id = 'd4575136-af5f-4fde-a87f-229536ec3b85' AND atividade_id IS NULL
   AND EXISTS (SELECT 1 FROM public.atividades WHERE id = '83b64a72-9624-46a4-b106-bc25a511043a');
UPDATE public.atividades SET deleted_at = now()
 WHERE id IN ('8e70e3a8-e0ec-4236-9df4-91903b22f847', '9fe2a7ba-1c41-444b-a9cf-204b7ad07bba') AND deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.briefings b WHERE b.atividade_id = atividades.id);
