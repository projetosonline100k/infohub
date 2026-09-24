-- Item 3 (rodada 3): primeira versão de monitoramento de foco nativo.
-- Supabase continua a fonte de verdade — o lado Rust só detecta app/janela
-- ativa e manda eventos crus pro frontend (ver src-tauri/src/focus_monitor.rs);
-- toda classificação/aprendizado/gravação acontece em TS
-- (src/hooks/useFocusActivityMonitor.ts).

CREATE TABLE public.focus_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  app_name text NOT NULL,
  bundle_id text,
  window_title text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer,
  classification text NOT NULL DEFAULT 'neutral'
    CHECK (classification IN ('work', 'neutral', 'possible_distraction', 'confirmed_distraction')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.focus_activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.focus_activity_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.focus_activity_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.focus_activity_events FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.focus_activity_events FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Regras aprendidas (item "Aprendizado") — sem IA: escopo por projeto/
-- atividade/app/padrão de título, quanto mais específico definido, mais
-- estreita a regra. Todos os campos de escopo são opcionais (nulos = regra
-- mais genérica).
CREATE TABLE public.focus_learned_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE CASCADE,
  app_name text,
  bundle_id text,
  window_title_pattern text,
  classification text NOT NULL CHECK (classification IN ('work', 'possible_distraction')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.focus_learned_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.focus_learned_rules FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.focus_learned_rules FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.focus_learned_rules FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.focus_learned_rules FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Privacidade (Administração → Jarvis → Privacidade) — reaproveita
-- jarvis_configuracoes (já existe, 1 linha por usuário, ver
-- 20260923010000_jarvis_mensagens_configuracoes.sql). Desligadas por
-- padrão: recurso sensível, opt-in.
ALTER TABLE public.jarvis_configuracoes ADD COLUMN IF NOT EXISTS monitorar_app_ativo boolean NOT NULL DEFAULT false;
ALTER TABLE public.jarvis_configuracoes ADD COLUMN IF NOT EXISTS analisar_titulo_janela boolean NOT NULL DEFAULT false;
ALTER TABLE public.jarvis_configuracoes ADD COLUMN IF NOT EXISTS detectar_distracoes boolean NOT NULL DEFAULT false;
