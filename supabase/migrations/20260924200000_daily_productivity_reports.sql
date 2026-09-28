-- "Encerrar o dia": um relatório por usuário/data, respostas do questionário
-- + uma FOTOGRAFIA congelada das métricas automáticas no momento em que o
-- dia foi encerrado (não recalculadas depois — editar/apagar uma tarefa
-- antiga não pode mudar um relatório de 3 semanas atrás). Métricas ao vivo
-- (hoje, últimos 7 dias) são calculadas na hora a partir de `atividades`/
-- `focus_sessions`/`focus_activity_events` — ver src/lib/productivity/.
CREATE TABLE public.daily_productivity_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,

  -- Questionário (item 3 do pedido)
  productivity_score smallint NOT NULL CHECK (productivity_score BETWEEN 0 AND 10),
  energy_score smallint NOT NULL CHECK (energy_score BETWEEN 1 AND 5),
  focus_score smallint NOT NULL CHECK (focus_score BETWEEN 1 AND 5),
  main_win text,
  main_blocker text CHECK (
    main_blocker IS NULL OR main_blocker IN (
      'celular', 'redes_sociais', 'cansaco', 'reunioes',
      'falta_clareza', 'procrastinacao', 'interrupcoes', 'outro'
    )
  ),
  main_blocker_other text,
  completed_main_priority boolean NOT NULL,
  pending_for_tomorrow text,
  tomorrow_main_priority text,

  -- Métricas automáticas (item 4 do pedido) — fotografia no momento do save.
  focused_seconds integer NOT NULL DEFAULT 0,
  paused_seconds integer NOT NULL DEFAULT 0,
  distraction_seconds integer NOT NULL DEFAULT 0,
  possible_distraction_seconds integer NOT NULL DEFAULT 0,
  overtime_seconds integer NOT NULL DEFAULT 0,
  longest_focus_seconds integer NOT NULL DEFAULT 0,
  completed_tasks integer NOT NULL DEFAULT 0,
  started_tasks integer NOT NULL DEFAULT 0,
  unfinished_tasks integer NOT NULL DEFAULT 0,
  overdue_tasks integer NOT NULL DEFAULT 0,
  -- Chamado "focus_sessions" no pedido original — renomeado aqui pra não
  -- colidir de leitura com a tabela nova public.focus_sessions.
  focus_sessions_count integer NOT NULL DEFAULT 0,
  pause_count integer NOT NULL DEFAULT 0,
  top_apps jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_projects jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- "Garantir apenas um relatório principal por usuário/data" (item 5).
  UNIQUE (user_id, date)
);

ALTER TABLE public.daily_productivity_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.daily_productivity_reports FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.daily_productivity_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.daily_productivity_reports FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.daily_productivity_reports FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Dashboard/Jarvis precisam refletir "dia encerrado" na hora, sem F5.
ALTER TABLE public.daily_productivity_reports REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_productivity_reports;
