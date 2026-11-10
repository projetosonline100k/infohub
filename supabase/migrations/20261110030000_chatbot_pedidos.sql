-- Assistente do chatbot pelo Claude do Davi (10/11/2026: "pode vincular ao uso daqui mesmo", sem chave de API): o
-- app grava o pedido aqui, o ouvinte do Atlas (claude -p, plano do Davi) responde com o chatbot ajustado e o app
-- aplica. Só o ouvinte (acesso de admin) muda status/resposta.
CREATE TABLE public.chatbot_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  mensagem text NOT NULL CHECK (btrim(mensagem) <> '' AND length(mensagem) <= 30000),
  config_atual jsonb NOT NULL,
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'respondido', 'erro')),
  resposta text,
  config jsonb,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  respondido_em timestamptz
);
CREATE INDEX chatbot_pedidos_fila_idx ON public.chatbot_pedidos (status, criado_em) WHERE status IN ('pendente', 'processando');

ALTER TABLE public.chatbot_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chatbot_pedidos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.chatbot_pedidos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.chatbot_pedidos FOR SELECT TO authenticated
  USING (public.team_row_allowed('chatbot_pedidos', to_jsonb(chatbot_pedidos.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.chatbot_pedidos FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('chatbot_pedidos', to_jsonb(chatbot_pedidos.*), 'conteudo', 'criar')
    AND status = 'pendente' AND resposta IS NULL AND config IS NULL);
GRANT SELECT, INSERT ON public.chatbot_pedidos TO authenticated;

NOTIFY pgrst, 'reload schema';
