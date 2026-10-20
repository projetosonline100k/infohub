-- Corrida até a meta de seguidores no Cronograma (20/10, Davi: "colocar a minha meta, tipo bater
-- 100k de seguidores, e ter uma corrida até chegar"). Uma meta por projeto, com prazo opcional.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS meta_seguidores integer CHECK (meta_seguidores IS NULL OR meta_seguidores > 0),
  ADD COLUMN IF NOT EXISTS meta_seguidores_prazo date,
  ADD COLUMN IF NOT EXISTS meta_seguidores_desde date;   -- dia em que a corrida começou (largada)
