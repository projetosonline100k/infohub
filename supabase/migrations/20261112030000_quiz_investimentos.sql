-- Painel de vendas por UTM (12/11/2026, Davi: "uma visualização estilo UTMify"): o investimento em anúncios de cada origem/campanha é
-- digitado na tabela (o Hub ainda não lê o gasto do Meta Ads), e dele saem lucro e ROAS.
CREATE TABLE public.quiz_investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  chave text NOT NULL CHECK (length(chave) <= 300),   -- "origem|meio|campanha" (vazio = sem UTM)
  valor numeric(12, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, chave)
);
ALTER TABLE public.quiz_investimentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_investimentos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.quiz_investimentos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.quiz_investimentos FOR SELECT TO authenticated USING (public.team_row_allowed('quiz_investimentos', to_jsonb(quiz_investimentos.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.quiz_investimentos FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('quiz_investimentos', to_jsonb(quiz_investimentos.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.quiz_investimentos FOR UPDATE TO authenticated USING (public.team_row_allowed('quiz_investimentos', to_jsonb(quiz_investimentos.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('quiz_investimentos', to_jsonb(quiz_investimentos.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.quiz_investimentos FOR DELETE TO authenticated USING (public.team_row_allowed('quiz_investimentos', to_jsonb(quiz_investimentos.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_investimentos TO authenticated;
NOTIFY pgrst, 'reload schema';
