-- Perfis da esteira dos vídeos dark (12/11/2026, Davi: "tira os dois perfis que estão lá, eu vou cadastrar novos perfis"): o dash do Lauro só mostra os projetos
-- cadastrados aqui. Tirar um perfil só o esconde do dash; o projeto e as edições continuam intactos.
CREATE TABLE public.esteira_dark_perfis (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.esteira_dark_perfis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esteira_dark_perfis FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.esteira_dark_perfis FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.esteira_dark_perfis FOR SELECT TO authenticated USING (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.esteira_dark_perfis FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_excluir ON public.esteira_dark_perfis FOR DELETE TO authenticated USING (public.team_row_allowed('esteira_dark_perfis', to_jsonb(esteira_dark_perfis.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, DELETE ON public.esteira_dark_perfis TO authenticated;
NOTIFY pgrst, 'reload schema';
