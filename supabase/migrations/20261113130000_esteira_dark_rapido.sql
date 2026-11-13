-- Conversar com o Lauro enquanto ele trabalha (13/11/2026, Davi: "é possível eu conversar com o Lauro e ele me responder sem parar o que está fazendo?").
-- Mensagem enviada com o Lauro ocupado vira pedido "rápido": uma resposta paralela (que enxerga o que ele está fazendo agora) sem interromper a tarefa em andamento.
-- Se a mensagem era uma instrução nova, a resposta rápida a encaminha como pedido normal (`encaminhado_id`), que o Lauro atende quando terminar o que está fazendo.
ALTER TABLE public.esteira_dark_pedidos ADD COLUMN rapido boolean NOT NULL DEFAULT false, ADD COLUMN encaminhado_id uuid;
CREATE INDEX esteira_dark_pedidos_rapido_idx ON public.esteira_dark_pedidos (criado_em) WHERE rapido AND status = 'pendente';
NOTIFY pgrst, 'reload schema';
