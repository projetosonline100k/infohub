-- Modo Creator do Jarvis: histórico das transcrições de vídeo (link → texto).
-- A transcrição roda no Mac (src-tauri/src/creator.rs); o app grava aqui.
CREATE TABLE IF NOT EXISTS public.creator_transcricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  link text NOT NULL,
  titulo text,
  autor text,
  texto text NOT NULL,
  idioma text,
  duracao_segundos integer,
  levou_segundos real,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_transcricoes_user_criada_idx ON public.creator_transcricoes (user_id, criada_em DESC);

ALTER TABLE public.creator_transcricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.creator_transcricoes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.creator_transcricoes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.creator_transcricoes FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.creator_transcricoes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.creator_transcricoes TO authenticated;
