-- Colunas do quadro (kanban) configuráveis: renomear e criar novas colunas.
-- status_key é o valor gravado em atividades.status; os quatro padrões usam
-- as mesmas chaves que o app já gravava antes (backlog, em_progresso,
-- revisao, finalizado), então nenhuma tarefa existente precisa mudar.
BEGIN;

CREATE TABLE public.colunas_atividade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  status_key text NOT NULL CHECK (btrim(status_key) <> ''),
  ordem integer NOT NULL DEFAULT 0,
  eh_conclusao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.colunas_atividade ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.colunas_atividade
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();

CREATE POLICY team_anon_read ON public.colunas_atividade AS RESTRICTIVE FOR SELECT TO anon USING (false);
CREATE POLICY team_anon_insert ON public.colunas_atividade AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY team_anon_update ON public.colunas_atividade AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY team_anon_delete ON public.colunas_atividade AS RESTRICTIVE FOR DELETE TO anon USING (false);

CREATE POLICY team_guard_acessar ON public.colunas_atividade AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_acessar ON public.colunas_atividade FOR SELECT TO authenticated
  USING (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'acessar'));

CREATE POLICY team_guard_criar ON public.colunas_atividade AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'criar'));
CREATE POLICY team_grant_insert ON public.colunas_atividade FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'criar'));

CREATE POLICY team_guard_update ON public.colunas_atividade AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'editar'));
CREATE POLICY team_grant_update ON public.colunas_atividade FOR UPDATE TO authenticated
  USING (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'editar'));

CREATE POLICY team_guard_excluir ON public.colunas_atividade AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'excluir'));
CREATE POLICY team_grant_excluir ON public.colunas_atividade FOR DELETE TO authenticated
  USING (public.team_row_allowed('colunas_atividade', to_jsonb(colunas_atividade.*), 'atividades', 'excluir'));

NOTIFY pgrst, 'reload schema';
COMMIT;
