-- Automações do Instagram em várias contas: a sua e as dos clientes.
-- Cada conta conectada pode estar ligada a um cliente (Projetos Milionários);
-- cada automação e cada disparo pertencem a uma conta. Clientes se conectam
-- por um link (OAuth do Instagram) cujo `state` fica em instagram_oauth_states.
BEGIN;

ALTER TABLE public.instagram_conexoes
  ADD COLUMN cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.instagram_automacoes
  ADD COLUMN ig_user_id text REFERENCES public.instagram_conexoes(ig_user_id) ON DELETE CASCADE;
ALTER TABLE public.instagram_automacao_disparos
  ADD COLUMN ig_user_id text;

-- Tudo que já existe é da primeira conta conectada de cada dono.
UPDATE public.instagram_automacoes a SET ig_user_id = (
  SELECT c.ig_user_id FROM public.instagram_conexoes c WHERE c.user_id = a.user_id ORDER BY c.criado_em LIMIT 1);
UPDATE public.instagram_automacao_disparos d SET ig_user_id = (
  SELECT c.ig_user_id FROM public.instagram_conexoes c WHERE c.user_id = d.user_id ORDER BY c.criado_em LIMIT 1);
DELETE FROM public.instagram_automacoes WHERE ig_user_id IS NULL;
ALTER TABLE public.instagram_automacoes ALTER COLUMN ig_user_id SET NOT NULL;

DROP INDEX public.instagram_automacoes_ativas_idx;
CREATE INDEX instagram_automacoes_ativas_idx ON public.instagram_automacoes (ig_user_id) WHERE ativo;

-- O app grava automações, mas só em conta conectada do próprio usuário
-- (a tabela de conexões não é legível pelo app, daí a função definer).
CREATE FUNCTION public.instagram_conta_minha(p_ig_user_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.instagram_conexoes WHERE ig_user_id = p_ig_user_id AND user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.instagram_conta_minha(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.instagram_conta_minha(text) TO authenticated;

DROP POLICY "account_owner_all" ON public.instagram_automacoes;
CREATE POLICY "account_owner_all" ON public.instagram_automacoes FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.instagram_conta_minha(ig_user_id));

-- Contas conectadas do usuário (sem token), com o cliente ligado.
DROP FUNCTION public.instagram_conexao_status();
CREATE FUNCTION public.instagram_contas()
RETURNS TABLE (ig_user_id text, username text, token_expira_em timestamptz, cliente_id uuid, cliente_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.ig_user_id, c.username, c.token_expira_em, c.cliente_id, cl.nome_especialista
  FROM public.instagram_conexoes c
  LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
  WHERE c.user_id = auth.uid()
  ORDER BY c.cliente_id NULLS FIRST, c.criado_em
$$;
REVOKE ALL ON FUNCTION public.instagram_contas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.instagram_contas() TO authenticated;

-- Links de conexão (OAuth): descartáveis, valem 7 dias.
CREATE TABLE public.instagram_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz
);
ALTER TABLE public.instagram_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_oauth_states FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
