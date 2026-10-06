-- Guia "Relatório" do Jarvis: diário rápido do dia ("fechei a call com o
-- Matheus", "gravei 3 vídeos"). Cada registro tem horário e, opcionalmente,
-- um projeto. Só o dono vê e mexe nos próprios registros.
CREATE TABLE IF NOT EXISTS public.relatorio_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT current_date,
  texto text NOT NULL CHECK (length(btrim(texto)) > 0),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relatorio_registros_user_data_idx ON public.relatorio_registros (user_id, data);

ALTER TABLE public.relatorio_registros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.relatorio_registros FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.relatorio_registros FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.relatorio_registros FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.relatorio_registros FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorio_registros TO authenticated;
