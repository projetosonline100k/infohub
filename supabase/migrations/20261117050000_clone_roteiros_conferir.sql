-- Core Clone: o Davi confirma no app que os vídeos ficaram prontos (17/11/2026: "fica um botão, onde eu aperto confirmando que ficou pronto, assim não precisa ficar indo e voltando").
-- Novo status 'conferir': o app marca os que estavam 'gerando'; o Mac só então olha o Core Clone, baixa os prontos e devolve o resto para 'gerando'.
ALTER TABLE public.clone_roteiros DROP CONSTRAINT clone_roteiros_status_check;
ALTER TABLE public.clone_roteiros ADD CONSTRAINT clone_roteiros_status_check CHECK (status IN ('fila', 'enviando', 'gerando', 'conferir', 'baixando', 'baixado', 'erro', 'cancelado'));
DROP INDEX IF EXISTS public.clone_roteiros_status_idx;
CREATE INDEX clone_roteiros_status_idx ON public.clone_roteiros (status) WHERE status IN ('fila', 'enviando', 'conferir', 'baixando');
DROP POLICY team_grant_update ON public.clone_roteiros;
CREATE POLICY team_grant_update ON public.clone_roteiros FOR UPDATE TO authenticated
  USING (status IN ('fila', 'erro', 'gerando') AND public.team_row_allowed('clone_roteiros', to_jsonb(clone_roteiros.*), 'conteudo', 'editar'))
  WITH CHECK (status IN ('cancelado', 'fila', 'conferir') AND public.team_row_allowed('clone_roteiros', to_jsonb(clone_roteiros.*), 'conteudo', 'editar'));
