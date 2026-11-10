-- Regressão: o pedido ao assistente entra pelo dono (sempre pendente, sem resposta pronta) e outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000271','cbp-dono@example.com',now()),
 ('10000000-0000-0000-0000-000000000272','cbp-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000271',true);   -- antes de criar: o gatilho carimba o dono
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000273', 'CBP', 30, 'x', '10000000-0000-0000-0000-000000000271');
INSERT INTO public.chatbots(id, cliente_id, nome, config, user_id) VALUES
 ('10000000-0000-0000-0000-000000000274', '10000000-0000-0000-0000-000000000273', 'A', '{"etapas":[]}', '10000000-0000-0000-0000-000000000271');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000271',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.chatbot_pedidos(id, chatbot_id, cliente_id, mensagem, config_atual)
  VALUES ('10000000-0000-0000-0000-000000000275', '10000000-0000-0000-0000-000000000274', '10000000-0000-0000-0000-000000000273', 'oi', '{}');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.chatbot_pedidos) <> 1 THEN RAISE EXCEPTION 'dono não vê o pedido'; END IF;
  BEGIN
    INSERT INTO public.chatbot_pedidos(chatbot_id, cliente_id, mensagem, config_atual, status, resposta)
      VALUES ('10000000-0000-0000-0000-000000000274', '10000000-0000-0000-0000-000000000273', 'x', '{}', 'respondido', 'falsa');
    RAISE EXCEPTION 'aceitou pedido já respondido';
  EXCEPTION WHEN check_violation OR insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'aceitou%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.chatbot_pedidos SET status = 'respondido';
    RAISE EXCEPTION 'dono conseguiu responder o próprio pedido';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000272',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.chatbot_pedidos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu o pedido'; END IF; END $$;
RESET ROLE;
ROLLBACK;
