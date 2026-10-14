-- Automações do Instagram (estilo "comentou a palavra, recebe a DM").
-- A Meta chama a edge function `instagram-automacoes` a cada comentário; ela
-- procura a palavra-chave nas automações ativas do dono da conta, manda a DM
-- (private reply) e, se configurado, responde o comentário em público.
-- Quem gerencia no dia a dia é scripts/instagram-automacoes.py (via Claude).
BEGIN;

-- Conta do Instagram conectada. Guarda o token de acesso: nenhum papel do app
-- lê esta tabela; só a edge function (service role) e o script de admin.
CREATE TABLE public.instagram_conexoes (
  ig_user_id text PRIMARY KEY,          -- id da conta profissional (entry.id no webhook)
  user_id uuid NOT NULL,                -- dono no Hub
  username text,
  access_token text NOT NULL,
  token_expira_em timestamptz,
  token_atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instagram_conexoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_conexoes FROM anon, authenticated;

CREATE TABLE public.instagram_automacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  palavras_chave text[] NOT NULL CHECK (cardinality(palavras_chave) > 0),
  -- contem: a palavra aparece no comentário ("eu QUERO muito");
  -- exata: o comentário é só a palavra (ignorando caixa, acento e pontuação).
  correspondencia text NOT NULL DEFAULT 'contem' CHECK (correspondencia IN ('contem', 'exata')),
  mensagem_dm text NOT NULL,
  -- Respostas públicas no comentário; sorteia uma (variar evita cara de spam).
  respostas_comentario text[] NOT NULL DEFAULT '{}',
  -- Posts/reels onde vale; null = todos.
  media_ids text[],
  ativo boolean NOT NULL DEFAULT true,
  disparos integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_automacoes_ativas_idx ON public.instagram_automacoes (user_id) WHERE ativo;

ALTER TABLE public.instagram_automacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_automacoes FROM anon, authenticated;
CREATE POLICY "account_owner_all" ON public.instagram_automacoes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_automacoes TO authenticated;

-- Histórico: um registro por comentário que bateu. comment_id único garante
-- que a Meta reenviando o mesmo webhook não manda a DM duas vezes.
CREATE TABLE public.instagram_automacao_disparos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  automacao_id uuid REFERENCES public.instagram_automacoes(id) ON DELETE SET NULL,
  comment_id text NOT NULL UNIQUE,
  media_id text,
  autor_id text,
  autor_username text,
  texto text,
  dm_status text NOT NULL DEFAULT 'pendente' CHECK (dm_status IN ('pendente', 'enviada', 'erro')),
  resposta_status text NOT NULL DEFAULT 'nenhuma' CHECK (resposta_status IN ('nenhuma', 'enviada', 'erro')),
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_automacao_disparos_recentes_idx ON public.instagram_automacao_disparos (user_id, criado_em DESC);

ALTER TABLE public.instagram_automacao_disparos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_automacao_disparos FROM anon, authenticated;
CREATE POLICY "account_owner_select" ON public.instagram_automacao_disparos FOR SELECT TO authenticated
  USING (user_id = auth.uid());
GRANT SELECT ON public.instagram_automacao_disparos TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
