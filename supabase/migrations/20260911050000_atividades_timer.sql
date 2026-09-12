-- Timer por tarefa: guarda quando foi iniciado; null quando parado.
-- O tempo restante é calculado no app a partir de tempo_estimado (minutos).
BEGIN;
ALTER TABLE public.atividades ADD COLUMN timer_iniciado_em timestamptz;
NOTIFY pgrst, 'reload schema';
COMMIT;
