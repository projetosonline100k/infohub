-- Zerar a conversa do agente (12/11/2026, Davi: "quero ter a opção de zerar a mensagem"): a tela só mostra os pedidos feitos depois desta marca.
ALTER TABLE public.agentes_whatsapp
  ADD COLUMN IF NOT EXISTS zerado_construir_em timestamptz,
  ADD COLUMN IF NOT EXISTS zerado_simular_em timestamptz;
NOTIFY pgrst, 'reload schema';
