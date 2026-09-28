-- "Performance": módulo de hábitos/rotinas de alta performance, separado
-- por completo de `atividades` (hábito ≠ atividade). 4 tabelas na ordem de
-- dependência: pilares → hábitos → logs diários → metas.

-- Pilares (Corpo/Mente/Trabalho/Vida pessoal por padrão, mas o usuário cria/
-- edita/exclui os seus). Nunca semeada por esta migration — os 4 pilares
-- padrão só nascem quando a pessoa cria o primeiro hábito pelo app (nunca
-- automaticamente sem confirmação).
CREATE TABLE public.performance_pillars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome)
);

ALTER TABLE public.performance_pillars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.performance_pillars FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.performance_pillars FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.performance_pillars FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.performance_pillars FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Hábitos configuráveis. `source`/`automatic_key` cobrem os "hábitos
-- automáticos" (Planejar o dia, Encerrar o dia, Prioridade #1, Horas de
-- foco, Tarefas concluídas) — lidos ao vivo de daily_plans/
-- daily_productivity_reports/focus_sessions/atividades, NUNCA duplicados
-- em performance_habit_logs.
CREATE TABLE public.performance_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pillar_id uuid REFERENCES public.performance_pillars(id) ON DELETE SET NULL,

  nome text NOT NULL,
  descricao text,
  tipo text NOT NULL CHECK (tipo IN ('boolean', 'numero', 'minutos', 'horas', 'paginas')),
  -- Obrigatório pra tipos não-boolean (correção da análise): sem isso,
  -- "completed" de um hábito numérico — sempre derivado na hora como
  -- value_numeric >= meta_diaria, nunca armazenado — ficaria indeterminado.
  meta_diaria numeric,
  unidade text,

  frequencia text NOT NULL DEFAULT 'todos_os_dias' CHECK (frequencia IN ('todos_os_dias', 'dias_especificos')),
  -- Date.getDay(): 0=domingo .. 6=sábado.
  dias_da_semana smallint[],

  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automatic')),
  automatic_key text CHECK (automatic_key IN (
    'daily_plan_exists', 'daily_report_exists', 'priority_one_completed',
    'focus_hours', 'tasks_completed'
  )),

  ativo boolean NOT NULL DEFAULT true,
  ordem smallint NOT NULL DEFAULT 0,

  -- V1: campos existem, mas nenhum formulário ainda os define (corte de
  -- escopo deliberado) — usePerformanceReminder.ts já sabe ler isto.
  lembrete_ativo boolean NOT NULL DEFAULT false,
  lembrete_horario time,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK ((source = 'automatic') = (automatic_key IS NOT NULL)),
  CHECK (frequencia = 'todos_os_dias' OR (dias_da_semana IS NOT NULL AND array_length(dias_da_semana, 1) > 0)),
  CHECK (tipo = 'boolean' OR meta_diaria IS NOT NULL)
);

ALTER TABLE public.performance_habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.performance_habits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.performance_habits FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.performance_habits FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.performance_habits FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Registrar num hábito em Jarvis e ver refletido na página Performance (e
-- vice-versa) exige sincronia entre janelas sem F5.
ALTER TABLE public.performance_habits REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_habits;

-- Registro diário de execução (só hábitos MANUAIS gravam aqui — os
-- automáticos nunca têm log próprio, são sempre recalculados na hora).
CREATE TABLE public.performance_habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.performance_habits(id) ON DELETE CASCADE,
  date date NOT NULL,
  value_numeric numeric,
  completed boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, habit_id, date)
);

ALTER TABLE public.performance_habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.performance_habit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.performance_habit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.performance_habit_logs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.performance_habit_logs FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.performance_habit_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_habit_logs;

-- Metas mensais/semanais/personalizadas, vinculadas a um hábito manual OU a
-- uma fonte automática (nunca as duas). Muda tão pouco quanto
-- performance_pillars — sem Realtime.
CREATE TABLE public.performance_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pillar_id uuid REFERENCES public.performance_pillars(id) ON DELETE SET NULL,

  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('numero', 'minutos', 'horas', 'paginas', 'percentual')),
  target_value numeric NOT NULL,
  unit text,

  period text NOT NULL CHECK (period IN ('semanal', 'mensal', 'personalizado')),
  start_date date NOT NULL,
  end_date date NOT NULL,

  linked_habit_id uuid REFERENCES public.performance_habits(id) ON DELETE SET NULL,
  automatic_source text CHECK (automatic_source IN (
    'daily_plan_exists', 'daily_report_exists', 'priority_one_completed',
    'focus_hours', 'tasks_completed'
  )),

  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (linked_habit_id IS NULL OR automatic_source IS NULL)
);

ALTER TABLE public.performance_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.performance_goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.performance_goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.performance_goals FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.performance_goals FOR DELETE TO authenticated USING (user_id = auth.uid());
