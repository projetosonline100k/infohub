-- Campo de descanso (item 4 do refinamento) — minutos de pausa associados à
-- atividade, ao lado de tempo_estimado (minutos de foco). Só o campo: sem
-- cronômetro automático de descanso, fora do que foi pedido.
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS tempo_descanso integer;
