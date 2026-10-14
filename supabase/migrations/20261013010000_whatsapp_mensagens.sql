-- Mensagens do WhatsApp do Davi, recebidas pelo WAHA rodando no Mac dele
-- (scripts/whatsapp-receptor.py). Só leitura: nada aqui envia mensagem.
-- Áudios são transcritos no Mac (Whisper) e o texto vai em `transcricao`.
-- Quem escreve é o receptor (conexão de admin); o app só lê, e só o dono.
BEGIN;

CREATE TABLE public.whatsapp_mensagens (
  id text PRIMARY KEY,                -- id da mensagem no WhatsApp (via WAHA)
  user_id uuid NOT NULL,
  chat_id text NOT NULL,              -- ex.: 5511999999999@c.us, 1203...@g.us
  chat_nome text,
  eh_grupo boolean NOT NULL DEFAULT false,
  autor_id text,
  autor_nome text,
  de_mim boolean NOT NULL DEFAULT false,
  tipo text NOT NULL DEFAULT 'texto', -- texto | audio | imagem | video | documento | figurinha | outro
  texto text,
  midia_tipo text,
  midia_duracao_s integer,
  transcricao text,
  transcricao_status text CHECK (transcricao_status IN ('pendente', 'transcrevendo', 'pronta', 'erro')),
  responde_a text,                    -- id da mensagem citada
  enviada_em timestamptz NOT NULL,
  recebida_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_mensagens_chat_idx ON public.whatsapp_mensagens (user_id, chat_id, enviada_em DESC);
CREATE INDEX whatsapp_mensagens_recentes_idx ON public.whatsapp_mensagens (user_id, enviada_em DESC);
CREATE INDEX whatsapp_mensagens_transcrever_idx ON public.whatsapp_mensagens (transcricao_status) WHERE transcricao_status = 'pendente';

ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_mensagens FROM anon, authenticated;
CREATE POLICY "account_owner_select" ON public.whatsapp_mensagens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.whatsapp_mensagens FOR DELETE TO authenticated USING (user_id = auth.uid());
-- O app pode ler e apagar (a "limpa" semanal); quem grava é só o receptor.
GRANT SELECT, DELETE ON public.whatsapp_mensagens TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
