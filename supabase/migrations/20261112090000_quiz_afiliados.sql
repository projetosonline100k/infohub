-- Afiliados do quiz (12/11/2026, Davi: "crio um link para a pessoa e a venda que sair dela puxa que foi da pessoa, sem perder dado nem cruzar").
-- Cada afiliado tem um CÓDIGO único e imutável. O link dele leva utm_content = aff_<codigo> (visita, lead e botão de compra da Eduzz/Kiwify/Hotmart carregam isso),
-- então a atribuição nunca depende de nome nem de origem/meio/campanha repetidos. O código não pode ser trocado (UPDATE não é liberado nessa coluna).
CREATE TABLE public.quiz_afiliados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 80),
  contato text CHECK (contato IS NULL OR length(contato) <= 120),
  codigo text NOT NULL CHECK (codigo ~ '^[a-z0-9]{3,24}$'),
  comissao_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (comissao_pct >= 0 AND comissao_pct <= 100),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quiz_afiliados_codigo_idx ON public.quiz_afiliados (codigo);
CREATE INDEX quiz_afiliados_quiz_idx ON public.quiz_afiliados (quiz_id);
ALTER TABLE public.quiz_afiliados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_afiliados FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.quiz_afiliados FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.quiz_afiliados FOR SELECT TO authenticated USING (public.team_row_allowed('quiz_afiliados', to_jsonb(quiz_afiliados.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.quiz_afiliados FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('quiz_afiliados', to_jsonb(quiz_afiliados.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.quiz_afiliados FOR UPDATE TO authenticated USING (public.team_row_allowed('quiz_afiliados', to_jsonb(quiz_afiliados.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('quiz_afiliados', to_jsonb(quiz_afiliados.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.quiz_afiliados FOR DELETE TO authenticated USING (public.team_row_allowed('quiz_afiliados', to_jsonb(quiz_afiliados.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, DELETE ON public.quiz_afiliados TO authenticated;
GRANT UPDATE (nome, contato, comissao_pct, ativo) ON public.quiz_afiliados TO authenticated;   -- o código nunca muda
NOTIFY pgrst, 'reload schema';
