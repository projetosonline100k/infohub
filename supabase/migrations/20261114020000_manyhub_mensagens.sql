-- Many Hub: conversa de cada pessoa (14/11/2026, Davi: "ver os leads, quem avançou, quem não avançou… e uma visualização estilo chat para conversar com a pessoa").
-- O robô (edge instagram-automacoes) passa a guardar cada DM que chega e cada DM que ele ou o Davi manda; o app só lê e, pela edge, responde dentro da janela de 24 h da Meta.
CREATE TABLE public.instagram_contatos (
  ig_user_id text NOT NULL,
  contato_id text NOT NULL,
  username text,
  nome text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ig_user_id, contato_id)
);
CREATE TABLE public.instagram_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_user_id text NOT NULL,
  contato_id text NOT NULL,
  mid text,
  de_mim boolean NOT NULL,
  origem text NOT NULL DEFAULT 'contato' CHECK (origem IN ('contato', 'fluxo', 'automacao', 'davi', 'instagram')),
  tipo text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'comentario', 'midia', 'botao')),
  texto text,
  fluxo_id uuid,
  enviada_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instagram_mensagens_mid_uq ON public.instagram_mensagens (ig_user_id, mid) WHERE mid IS NOT NULL;
CREATE INDEX instagram_mensagens_chat_idx ON public.instagram_mensagens (ig_user_id, contato_id, enviada_em);
CREATE INDEX instagram_mensagens_conta_idx ON public.instagram_mensagens (ig_user_id, enviada_em DESC);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instagram_contatos', 'instagram_mensagens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY equipe_le ON public.%I FOR SELECT TO authenticated USING (public.instagram_conta_permite(ig_user_id, ''acessar''))', t);
  END LOOP;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_mensagens;
NOTIFY pgrst, 'reload schema';
