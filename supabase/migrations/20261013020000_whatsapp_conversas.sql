-- Guia "Conversas" do Jarvis: mensagens ao vivo (realtime) e a lista de
-- conversas (a última mensagem de cada uma). A função roda com as permissões
-- de quem chama (RLS: só o dono vê).
BEGIN;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;

CREATE OR REPLACE FUNCTION public.whatsapp_conversas(p_limite integer DEFAULT 200)
RETURNS TABLE (chat_id text, chat_nome text, eh_grupo boolean, ultima_em timestamptz, ultima_de_mim boolean,
               ultima_tipo text, ultima_texto text, ultima_autor text, total bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT ON (m.chat_id) m.chat_id, m.chat_nome, m.eh_grupo, m.enviada_em, m.de_mim, m.tipo,
         coalesce(m.texto, m.transcricao), m.autor_nome,
         count(*) OVER (PARTITION BY m.chat_id)
  FROM whatsapp_mensagens m
  WHERE m.user_id = auth.uid()
  ORDER BY m.chat_id, m.enviada_em DESC
$$;
REVOKE ALL ON FUNCTION public.whatsapp_conversas(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_conversas(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
