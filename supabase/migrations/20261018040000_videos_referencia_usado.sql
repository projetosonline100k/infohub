-- Banco de virais no documento (18/10/2026, Davi): "⌘H no documento mostra os vídeos salvos;
-- ao selecionar, já marca que aquele vídeo foi usado". Quando foi usado num roteiro (null = livre).
ALTER TABLE public.videos_referencia ADD COLUMN IF NOT EXISTS usado_em timestamptz;
NOTIFY pgrst, 'reload schema';
