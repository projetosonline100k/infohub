ALTER TABLE public.videos_vertical
  ADD COLUMN IF NOT EXISTS arquivo_url TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_chave TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_nome TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_tamanho BIGINT;

ALTER TABLE public.videos_youtube
  ADD COLUMN IF NOT EXISTS arquivo_url TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_chave TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_nome TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_tamanho BIGINT;
