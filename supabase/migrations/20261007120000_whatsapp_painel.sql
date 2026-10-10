-- Guia "WhatsApp" do Jarvis: o painel de respostas aos mentorados que a
-- rotina do Claude monta lendo o WhatsApp (cards com DISC e sugestões em
-- sanduíche + histórico pras métricas). Uma linha por pessoa: a rotina
-- publica `cards`/`historico` (scripts/publicar-painel-whatsapp.py) e o app
-- só marca o que já foi respondido (`respondidos`, id do card → true).
CREATE TABLE IF NOT EXISTS public.whatsapp_painel (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  historico jsonb NOT NULL DEFAULT '{}'::jsonb,
  respondidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_painel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.whatsapp_painel FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.whatsapp_painel FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.whatsapp_painel FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.whatsapp_painel TO authenticated;
