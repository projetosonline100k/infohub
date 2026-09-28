-- "Sono" dentro de Performance — 2 tabelas + 1 coluna aditiva. `time` sem
-- timezone (mesma convenção já usada em performance_habits.lembrete_horario)
-- pra horário-do-dia puro, sem ambiguidade de fuso.

-- Registro diário de sono. `total_sleep_minutes` é calculado no app (ver
-- SleepService.calcularDuracaoMinutos, trata virada de meia-noite) e
-- gravado aqui — nunca recalculado via trigger, único caminho de escrita é
-- SleepService.salvarLog.
CREATE TABLE public.sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sleep_date date NOT NULL,
  bed_time time NOT NULL,
  wake_time time NOT NULL,
  total_sleep_minutes integer NOT NULL,
  quality_score smallint NOT NULL CHECK (quality_score BETWEEN 1 AND 10),
  night_awakenings smallint,
  wake_feeling text CHECK (wake_feeling IN ('muito_cansado', 'cansado', 'normal', 'bem', 'muito_disposto')),
  notes text,
  -- V1: só 'manual'. Campo já existe pra integrações futuras (item 18 do
  -- pedido) sem precisar de migration nova quando chegarem.
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'apple_health', 'fitbit', 'wearable', 'outro')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sleep_date)
);

ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.sleep_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.sleep_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.sleep_logs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.sleep_logs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Visão geral/Jarvis precisam refletir um registro novo sem F5.
ALTER TABLE public.sleep_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sleep_logs;

-- Meta de sono — 1 linha por usuário (mesmo padrão de jarvis_configuracoes:
-- PK é o próprio user_id, sem id separado). Muda raríssimo, sem Realtime.
CREATE TABLE public.sleep_goals (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  target_sleep_minutes integer NOT NULL DEFAULT 450,
  ideal_bed_time time,
  ideal_wake_time time,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sleep_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.sleep_goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.sleep_goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.sleep_goals FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.sleep_goals FOR DELETE TO authenticated USING (user_id = auth.uid());

-- "Que horas você pretende dormir hoje?" (Encerrar o dia) — comparado no
-- dia seguinte contra o bed_time real do próximo sleep_log.
ALTER TABLE public.daily_productivity_reports
  ADD COLUMN planned_bed_time time;
