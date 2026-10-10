-- Botão "Atualizar" da guia WhatsApp do Jarvis: o app registra um pedido e
-- a sessão do Claude que está ouvindo (scripts/esperar-pedido-whatsapp.py)
-- lê o WhatsApp, publica e fecha o pedido.
--   atualizacao_status: pedida → rodando → ok | erro
ALTER TABLE public.whatsapp_painel
  ADD COLUMN IF NOT EXISTS atualizacao_pedida_em timestamptz,
  ADD COLUMN IF NOT EXISTS atualizacao_status text CHECK (atualizacao_status IN ('pedida', 'rodando', 'ok', 'erro')),
  ADD COLUMN IF NOT EXISTS atualizacao_mensagem text;
