-- Botão "Buscar seguidores novos" do CRM (18/11/2026, Davi: "um botão que entre naquele Instagram e comece a mapear mais perfis que me seguiram").
-- O app só registra o pedido; o Mac (ouvinte, Chrome do Davi logado no Instagram) lê o topo da lista de seguidores e põe os novos em "Novo seguidor".
CREATE TABLE public.crm_pedidos_seguidores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  quantidade integer NOT NULL DEFAULT 100 CHECK (quantidade BETWEEN 10 AND 500),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'lendo', 'ok', 'erro')),
  lidos integer,
  novos integer,
  mensagem text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_pedidos_seguidores_idx ON public.crm_pedidos_seguidores (cliente_id, criado_em DESC);
ALTER TABLE public.crm_pedidos_seguidores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_pedidos_seguidores FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.crm_pedidos_seguidores FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.crm_pedidos_seguidores FOR SELECT TO authenticated USING (public.team_row_allowed('crm_pedidos_seguidores', to_jsonb(crm_pedidos_seguidores.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.crm_pedidos_seguidores FOR INSERT TO authenticated
  WITH CHECK (status = 'pendente' AND public.team_row_allowed('crm_pedidos_seguidores', to_jsonb(crm_pedidos_seguidores.*), 'conteudo', 'criar'));
GRANT SELECT ON public.crm_pedidos_seguidores TO authenticated;
GRANT INSERT (cliente_id, quantidade) ON public.crm_pedidos_seguidores TO authenticated;
NOTIFY pgrst, 'reload schema';
