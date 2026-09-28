-- "Começar o dia": ritual matinal complementar ao "Encerrar o dia" — define
-- até 3 atividades que importam hoje (80/20) e qual delas é a prioridade
-- #1, usada o dia inteiro pra pesar recomendações/cobranças e, à noite,
-- pelo Encerrar o dia (que passa a SABER qual era a prioridade em vez de
-- perguntar genericamente de novo).
CREATE TABLE public.daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,

  main_priority_activity_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  focus_time_available_minutes integer,
  mandatory_outcome text,
  -- Lista PRÓPRIA, diferente da de daily_productivity_reports.main_blocker
  -- (troca "procrastinação" por "equipe") — pedido explícito, não é o
  -- mesmo questionário.
  expected_blocker text CHECK (
    expected_blocker IS NULL OR expected_blocker IN (
      'celular', 'redes_sociais', 'reunioes', 'equipe',
      'cansaco', 'falta_clareza', 'interrupcoes', 'outro'
    )
  ),
  expected_blocker_other text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- "Um planejamento principal por usuário/data" (item 7).
  UNIQUE (user_id, date)
);

ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.daily_plans FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.daily_plans FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.daily_plans FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.daily_plans FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Dashboard/Home precisam refletir um plano novo/ajustado na hora, sem F5.
ALTER TABLE public.daily_plans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_plans;

-- As até-3 atividades escolhidas (80/20) — referencia o ID real, nunca
-- copia dado da atividade. `user_id` direto aqui (não só via join no
-- daily_plan_id) pra RLS simples, mesmo padrão já usado em
-- focus_learned_rules (child table de atividades/clientes).
CREATE TABLE public.daily_plan_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_plan_id uuid NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (daily_plan_id, activity_id)
);

ALTER TABLE public.daily_plan_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.daily_plan_activities FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.daily_plan_activities FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.daily_plan_activities FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.daily_plan_activities FOR DELETE TO authenticated USING (user_id = auth.uid());
