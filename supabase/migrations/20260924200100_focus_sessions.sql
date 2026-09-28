-- "Encerrar o dia" precisa saber quantas sessões de foco aconteceram HOJE e
-- qual foi a maior — atividades.timer_decorrido_segundos é um acumulador
-- VITALÍCIO por tarefa (só zera ao concluir ou "zerar"), não por dia, e não
-- existe nenhum log de início/fim de sessão em lugar nenhum hoje. Sem esta
-- tabela, "tempo de foco hoje"/"maior sessão"/"número de sessões" não dão
-- pra calcular corretamente se uma tarefa foi trabalhada em mais de um dia
-- sem resetar o timer.
--
-- Alimentada nos únicos 4 pontos onde um timer já para hoje (iniciarTimer/
-- pausarTimer/concluir/zerarTimer em useAssistantAtividades.ts) — puramente
-- aditivo, não muda nada do comportamento atual do timer/acumulador.
CREATE TABLE public.focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds >= 0),
  -- Distingue "pausei e devo voltar" de "terminei"/"zerei", pra dar pra
  -- calcular "quantidade de pausas" separado de sessões concluídas.
  ended_reason text NOT NULL DEFAULT 'pause' CHECK (ended_reason IN ('pause', 'complete', 'reset')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.focus_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.focus_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.focus_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.focus_sessions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Escrita e leitura sempre pelo mesmo cliente que gravou (relatório do dia,
-- dashboard) — sem necessidade de sincronizar ao vivo entre janelas, mesmo
-- critério já usado em focus_activity_events.
CREATE INDEX idx_focus_sessions_user_started ON public.focus_sessions (user_id, started_at);
