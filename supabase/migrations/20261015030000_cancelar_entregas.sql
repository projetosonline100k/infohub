-- Pedido do Davi (15/10/2026): poder cancelar uma entrega que não vai seguir
-- (ex.: a edição de teste do Danilo). Cancelado sai de "Precisa de você" e
-- das filas; o Danilo e o Roy ignoram (só olham os status de trabalho).
ALTER TABLE public.edicoes_video DROP CONSTRAINT edicoes_video_status_check;
ALTER TABLE public.edicoes_video ADD CONSTRAINT edicoes_video_status_check
  CHECK (status IN ('na_fila', 'editando', 'revisar', 'renderizando', 'aprovando', 'aprovado', 'erro', 'cancelado'));
ALTER TABLE public.carrosseis DROP CONSTRAINT carrosseis_status_check;
ALTER TABLE public.carrosseis ADD CONSTRAINT carrosseis_status_check
  CHECK (status IN ('produzindo', 'revisar', 'ajuste', 'aprovado', 'programado', 'publicando', 'publicado', 'erro', 'cancelado'));
