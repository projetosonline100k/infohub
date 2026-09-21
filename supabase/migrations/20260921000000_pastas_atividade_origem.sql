-- Pastas de Atividades e de Documentos viviam na mesma lista (pastas_atividade
-- é literalmente a mesma tabela pras duas telas), então uma pasta nova criada
-- em Documentos aparecia também na barra de pastas de Atividades e vice-versa.
-- "origem" separa as duas listas sem duplicar a tabela nem perder o
-- compartilhamento pasta<->documentos já existente (documentos.pasta_id).
BEGIN;

ALTER TABLE public.pastas_atividade
  ADD COLUMN origem text NOT NULL DEFAULT 'atividades' CHECK (origem IN ('atividades', 'documentos'));

-- Reaproveita o valor de origem como a própria área de permissão: já existem
-- as áreas 'atividades' e 'documentos' no sistema de permissões por equipe,
-- então criar pasta em Documentos passa a exigir permissão de 'documentos',
-- não mais de 'atividades'.
DROP POLICY team_guard_acessar ON public.pastas_atividade;
DROP POLICY team_grant_acessar ON public.pastas_atividade;
DROP POLICY team_guard_criar ON public.pastas_atividade;
DROP POLICY team_grant_insert ON public.pastas_atividade;
DROP POLICY team_guard_update ON public.pastas_atividade;
DROP POLICY team_grant_update ON public.pastas_atividade;
DROP POLICY team_guard_excluir ON public.pastas_atividade;
DROP POLICY team_grant_excluir ON public.pastas_atividade;

CREATE POLICY team_guard_acessar ON public.pastas_atividade AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'acessar'));
CREATE POLICY team_grant_acessar ON public.pastas_atividade FOR SELECT TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'acessar'));

CREATE POLICY team_guard_criar ON public.pastas_atividade AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'criar'));
CREATE POLICY team_grant_insert ON public.pastas_atividade FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'criar'));

CREATE POLICY team_guard_update ON public.pastas_atividade AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'editar'))
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'editar'));
CREATE POLICY team_grant_update ON public.pastas_atividade FOR UPDATE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'editar'))
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'editar'));

CREATE POLICY team_guard_excluir ON public.pastas_atividade AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'excluir'));
CREATE POLICY team_grant_excluir ON public.pastas_atividade FOR DELETE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), pastas_atividade.origem, 'excluir'));

NOTIFY pgrst, 'reload schema';
COMMIT;
