-- Mensagens espontâneas do Jarvis (item 2 do refinamento) — cadastradas em
-- Administração → Jarvis, consumidas por useAssistantCobranca.ts. Mesmo
-- padrão de posse por conta (user_id = auth.uid()) de add_account_ownership.sql.
CREATE TABLE public.jarvis_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mensagem text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('motivacao', 'alerta', 'retorno_foco', 'pausa', 'conclusao')),
  ativo boolean NOT NULL DEFAULT true,
  intervalo_minimo_minutos integer NOT NULL DEFAULT 30,
  contexto text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jarvis_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.jarvis_mensagens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.jarvis_mensagens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.jarvis_mensagens FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.jarvis_mensagens FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.jarvis_mensagens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_mensagens;

-- Preferências do Jarvis (item 7: "Sons do Jarvis" ON/OFF) — uma linha por
-- usuário, mesmo padrão de posse.
CREATE TABLE public.jarvis_configuracoes (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  som_ativado boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jarvis_configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.jarvis_configuracoes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.jarvis_configuracoes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.jarvis_configuracoes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.jarvis_configuracoes FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.jarvis_configuracoes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_configuracoes;
