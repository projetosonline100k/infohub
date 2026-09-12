-- Base para pausar/retomar o timer: segundos já decorridos antes da corrida
-- atual. Tempo restante = tempo_estimado*60 - timer_decorrido_segundos -
-- (agora - timer_iniciado_em, se estiver rodando).
BEGIN;
ALTER TABLE public.atividades ADD COLUMN timer_decorrido_segundos integer NOT NULL DEFAULT 0;
NOTIFY pgrst, 'reload schema';
COMMIT;
