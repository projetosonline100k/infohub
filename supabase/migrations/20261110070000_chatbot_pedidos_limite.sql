-- Roteiros colados no assistente do chatbot podem ser longos (10/11/2026, Davi): o limite do pedido sobe de 30 mil para 120 mil caracteres.
ALTER TABLE public.chatbot_pedidos DROP CONSTRAINT chatbot_pedidos_mensagem_check;
ALTER TABLE public.chatbot_pedidos ADD CONSTRAINT chatbot_pedidos_mensagem_check CHECK (btrim(mensagem) <> '' AND length(mensagem) <= 120000);
NOTIFY pgrst, 'reload schema';
