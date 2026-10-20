-- WhatsApp no Infopro: arquivar conversas e pastas (20/10, Davi: "no meu WhatsApp eu consigo arquivar
-- grupos e mensagens; aqui está tudo junto" + "conseguir criar pastas"). Por número (conta) e só do dono.
CREATE TABLE IF NOT EXISTS public.whatsapp_pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  conta text NOT NULL DEFAULT 'principal',
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  ordem int NOT NULL DEFAULT 0,
  criada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conta, nome)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_organizacao (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  conta text NOT NULL DEFAULT 'principal',
  chat_id text NOT NULL,
  arquivada boolean NOT NULL DEFAULT false,
  pasta_id uuid REFERENCES public.whatsapp_pastas(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conta, chat_id)
);

ALTER TABLE public.whatsapp_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_organizacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_pastas_dono ON public.whatsapp_pastas;
CREATE POLICY whatsapp_pastas_dono ON public.whatsapp_pastas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS whatsapp_organizacao_dono ON public.whatsapp_organizacao;
CREATE POLICY whatsapp_organizacao_dono ON public.whatsapp_organizacao FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
