-- Perfis próprios da esteira dark (12/11/2026, Davi: "o perfil que eu vou criar é outro chat, não é projeto; preciso criar do zero e, ao clicar nele, cadastrar o estilo do vídeo").
-- Troca a versão anterior (que só apontava para projetos, sem nenhum registro ainda): agora o perfil é criado aqui, tem nome, @ e um ESTILO de vídeo (JSON editável),
-- e pode, se quiser, ser ligado a um projeto (cliente_id) para trazer as edições dark dele para a esteira.
DROP TABLE IF EXISTS public.esteira_dark_perfis;
CREATE TABLE public.esteira_dark_perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 80),
  arroba text CHECK (arroba IS NULL OR length(arroba) <= 60),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  estilo jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX esteira_dark_perfis_nome_idx ON public.esteira_dark_perfis (user_id, lower(btrim(nome)));
ALTER TABLE public.esteira_dark_perfis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esteira_dark_perfis FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.esteira_dark_perfis FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.esteira_dark_perfis FOR SELECT TO authenticated USING (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.esteira_dark_perfis FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.esteira_dark_perfis FOR UPDATE TO authenticated USING (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.esteira_dark_perfis FOR DELETE TO authenticated USING (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, DELETE ON public.esteira_dark_perfis TO authenticated;
GRANT UPDATE (nome, arroba, cliente_id, estilo, atualizado_em) ON public.esteira_dark_perfis TO authenticated;
NOTIFY pgrst, 'reload schema';
