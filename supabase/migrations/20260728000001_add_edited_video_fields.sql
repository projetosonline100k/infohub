ALTER TABLE public.videos_vertical
  ADD COLUMN IF NOT EXISTS editado_url TEXT,
  ADD COLUMN IF NOT EXISTS editado_chave TEXT,
  ADD COLUMN IF NOT EXISTS editado_nome TEXT,
  ADD COLUMN IF NOT EXISTS editado_tamanho BIGINT;

ALTER TABLE public.videos_youtube
  ADD COLUMN IF NOT EXISTS editado_url TEXT,
  ADD COLUMN IF NOT EXISTS editado_chave TEXT,
  ADD COLUMN IF NOT EXISTS editado_nome TEXT,
  ADD COLUMN IF NOT EXISTS editado_tamanho BIGINT;
