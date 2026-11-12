-- Gabriela, a agente "viva" que monta a inteligência (12/11/2026, Davi: "as coisas que peço no chat se perdem; deixa um agente vivo lá"):
-- guarda a sessão do Claude para ela lembrar de tudo que foi pedido, de uma mensagem para a outra.
ALTER TABLE public.agentes_whatsapp ADD COLUMN IF NOT EXISTS sessao_construir text;
NOTIFY pgrst, 'reload schema';
