-- Inteligência do agente do WhatsApp (12/11/2026, Davi: "no X1 vou conversando e a gente monta a inteligência do agente: produto, ofertas, o que
-- pode e não pode, objetivo… a ideia é um agente que converse com os leads e venda"). Uma inteligência por projeto, montada numa conversa com o
-- Claude (pedidos tratados pelo ouvinte do Atlas, como o assistente do chatbot) e editável à mão. Também dá para SIMULAR: o Davi faz o papel do lead.
-- Nada aqui envia mensagem para lead: é só a inteligência e o teste.
CREATE TABLE public.agentes_whatsapp (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agente_whatsapp_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  autor_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('construir', 'simular')),
  mensagem text NOT NULL CHECK (btrim(mensagem) <> '' AND length(mensagem) <= 60000),
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,        -- quiz, perfis, dados do lead simulado
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  config_atual jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'respondido', 'erro')),
  resposta text,
  config jsonb,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  respondido_em timestamptz
);
CREATE INDEX agente_whatsapp_pedidos_fila_idx ON public.agente_whatsapp_pedidos (status, criado_em) WHERE status IN ('pendente', 'processando');

CREATE OR REPLACE FUNCTION public.agente_pedido_autor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF auth.uid() IS NOT NULL THEN NEW.autor_id := auth.uid(); END IF; RETURN NEW; END; $$;
CREATE TRIGGER agente_pedido_autor BEFORE INSERT ON public.agente_whatsapp_pedidos FOR EACH ROW EXECUTE FUNCTION public.agente_pedido_autor();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agentes_whatsapp', 'agente_whatsapp_pedidos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''acessar''))', t, t, t);
  END LOOP;
END $$;
CREATE POLICY team_grant_insert ON public.agentes_whatsapp FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('agentes_whatsapp', to_jsonb(agentes_whatsapp.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.agentes_whatsapp FOR UPDATE TO authenticated USING (public.team_row_allowed('agentes_whatsapp', to_jsonb(agentes_whatsapp.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('agentes_whatsapp', to_jsonb(agentes_whatsapp.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_insert ON public.agente_whatsapp_pedidos FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('agente_whatsapp_pedidos', to_jsonb(agente_whatsapp_pedidos.*), 'conteudo', 'editar') AND status = 'pendente' AND resposta IS NULL AND config IS NULL);
GRANT SELECT, INSERT, UPDATE ON public.agentes_whatsapp TO authenticated;
GRANT SELECT, INSERT ON public.agente_whatsapp_pedidos TO authenticated;   -- quem responde é o ouvinte (admin)
NOTIFY pgrst, 'reload schema';
