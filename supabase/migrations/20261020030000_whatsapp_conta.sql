-- Mais de um WhatsApp no Mac (20/10/2026, Davi: "quero conectar outro no Davi Queiroz", o número
-- pessoal). Cada mensagem guarda de qual número veio (conta); cada projeto diz qual número mostra.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.whatsapp_mensagens ADD COLUMN IF NOT EXISTS conta text NOT NULL DEFAULT 'principal';
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_conta_chat_idx
  ON public.whatsapp_mensagens (user_id, conta, chat_id, enviada_em DESC);

-- Número do projeto (null = o principal, o da Shirley da Core).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS whatsapp_conta text;
UPDATE public.clientes SET whatsapp_conta = 'pessoal' WHERE id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';

DROP FUNCTION IF EXISTS public.whatsapp_conversas(integer);
CREATE FUNCTION public.whatsapp_conversas(p_limite integer DEFAULT 200, p_conta text DEFAULT 'principal')
 RETURNS TABLE(chat_id text, chat_nome text, eh_grupo boolean, ultima_em timestamp with time zone, ultima_de_mim boolean,
               ultima_tipo text, ultima_texto text, ultima_autor text, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (m.chat_id) m.chat_id, m.chat_nome, m.eh_grupo, m.enviada_em, m.de_mim, m.tipo,
         coalesce(m.texto, m.transcricao), m.autor_nome,
         count(*) OVER (PARTITION BY m.chat_id)
  FROM whatsapp_mensagens m
  WHERE m.user_id = auth.uid() AND m.conta = coalesce(p_conta, 'principal')
  ORDER BY m.chat_id, m.enviada_em DESC
$function$;
GRANT EXECUTE ON FUNCTION public.whatsapp_conversas(integer, text) TO authenticated;
