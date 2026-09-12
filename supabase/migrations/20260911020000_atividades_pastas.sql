-- Pastas para agrupar atividades, responsável por tarefa e lixeira com
-- exclusão em cascata (pasta + tarefas + subtarefas). A expiração de 15 dias
-- é aplicada pelo aplicativo, que apaga definitivamente pastas com
-- deleted_at antigo sempre que a lixeira é aberta.
BEGIN;

CREATE TABLE public.pastas_atividade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  ordem integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atividades
  ADD COLUMN pasta_id uuid REFERENCES public.pastas_atividade(id) ON DELETE CASCADE,
  ADD COLUMN responsavel_nome text,
  ADD COLUMN deleted_at timestamptz;

-- Mesma proteção de equipe já usada pela área 'atividades'.
ALTER TABLE public.pastas_atividade ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.pastas_atividade
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();

CREATE POLICY team_anon_read ON public.pastas_atividade AS RESTRICTIVE FOR SELECT TO anon USING (false);
CREATE POLICY team_anon_insert ON public.pastas_atividade AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY team_anon_update ON public.pastas_atividade AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY team_anon_delete ON public.pastas_atividade AS RESTRICTIVE FOR DELETE TO anon USING (false);

CREATE POLICY team_guard_acessar ON public.pastas_atividade AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_acessar ON public.pastas_atividade FOR SELECT TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'acessar'));

CREATE POLICY team_guard_criar ON public.pastas_atividade AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'criar'));
CREATE POLICY team_grant_insert ON public.pastas_atividade FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'criar'));

CREATE POLICY team_guard_update ON public.pastas_atividade AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'editar'));
CREATE POLICY team_grant_update ON public.pastas_atividade FOR UPDATE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'editar'));

CREATE POLICY team_guard_excluir ON public.pastas_atividade AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'excluir'));
CREATE POLICY team_grant_excluir ON public.pastas_atividade FOR DELETE TO authenticated
  USING (public.team_row_allowed('pastas_atividade', to_jsonb(pastas_atividade.*), 'atividades', 'excluir'));

NOTIFY pgrst, 'reload schema';
COMMIT;
