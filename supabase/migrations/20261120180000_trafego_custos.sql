-- Custos do projeto para o lucro líquido da aba Tráfego (20/11/2026, Davi: "copiar as coisas da UTMify"): taxa da plataforma de pagamento (%),
-- imposto (%) e outros custos por dia (R$). Uma linha por projeto. Lucro líquido = faturamento − gasto de anúncios − taxas − impostos − outros.
CREATE TABLE public.trafego_custos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  taxa_plataforma_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (taxa_plataforma_pct >= 0 AND taxa_plataforma_pct <= 100),
  imposto_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (imposto_pct >= 0 AND imposto_pct <= 100),
  outros_custos_dia numeric(12, 2) NOT NULL DEFAULT 0 CHECK (outros_custos_dia >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trafego_custos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trafego_custos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.trafego_custos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.trafego_custos FOR SELECT TO authenticated USING (public.team_row_allowed('trafego_custos', to_jsonb(trafego_custos.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.trafego_custos FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('trafego_custos', to_jsonb(trafego_custos.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.trafego_custos FOR UPDATE TO authenticated USING (public.team_row_allowed('trafego_custos', to_jsonb(trafego_custos.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('trafego_custos', to_jsonb(trafego_custos.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.trafego_custos FOR DELETE TO authenticated USING (public.team_row_allowed('trafego_custos', to_jsonb(trafego_custos.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trafego_custos TO authenticated;
