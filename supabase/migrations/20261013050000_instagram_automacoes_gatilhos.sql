-- Automações do Instagram: além de comentário, dispara por DM com a
-- palavra-chave e por resposta de story. O histórico passa a guardar a origem
-- e o id do evento (comentário ou mensagem). A tela /automacoes ganha uma
-- função para ver o status da conexão sem enxergar o token.
BEGIN;

ALTER TABLE public.instagram_automacoes
  ADD COLUMN gatilhos text[] NOT NULL DEFAULT '{comentario}'
    CHECK (cardinality(gatilhos) > 0 AND gatilhos <@ ARRAY['comentario', 'dm', 'story']::text[]);
COMMENT ON COLUMN public.instagram_automacoes.media_ids IS
  'Posts/reels onde vale o gatilho de comentário; null = todos. Não se aplica a DM e story.';

ALTER TABLE public.instagram_automacao_disparos RENAME COLUMN comment_id TO evento_id;
ALTER TABLE public.instagram_automacao_disparos
  ADD COLUMN origem text NOT NULL DEFAULT 'comentario' CHECK (origem IN ('comentario', 'dm', 'story'));
COMMENT ON COLUMN public.instagram_automacao_disparos.evento_id IS
  'id do comentário ou da mensagem; único para a Meta não disparar duas vezes';

CREATE FUNCTION public.instagram_conexao_status()
RETURNS TABLE (ig_user_id text, username text, token_expira_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.ig_user_id, c.username, c.token_expira_em
  FROM public.instagram_conexoes c
  WHERE c.user_id = auth.uid()
  ORDER BY c.criado_em
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.instagram_conexao_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.instagram_conexao_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
