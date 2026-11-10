-- Regressão: só o Davi liga o modo vivo do chatbot; o autor do pedido é sempre quem escreveu.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000301','cbv-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000301',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000303', 'CBV', 30, 'x', '10000000-0000-0000-0000-000000000301');
INSERT INTO public.chatbots(id, cliente_id, nome, config) VALUES ('10000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000303', 'A', '{"etapas":[]}');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.chatbots SET modo_vivo = true WHERE id = '10000000-0000-0000-0000-000000000304';
    RAISE EXCEPTION 'outra pessoa ligou o modo vivo';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'só o Davi%' THEN RAISE; END IF; END;
  INSERT INTO public.chatbot_pedidos(chatbot_id, cliente_id, mensagem, config_atual, autor_id)
    VALUES ('10000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000303', 'oi', '{}', '10000000-0000-0000-0000-0000000000ff');
  IF (SELECT autor_id FROM public.chatbot_pedidos) <> '10000000-0000-0000-0000-000000000301' THEN RAISE EXCEPTION 'autor forjado'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.chatbots SET modo_vivo = true WHERE id = '10000000-0000-0000-0000-000000000304';
ROLLBACK;
