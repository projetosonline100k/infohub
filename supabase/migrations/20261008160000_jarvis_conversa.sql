-- Conversa do Jarvis com o chat "Inteligência do Infopro" (sessão do Claude
-- no app desktop). O Davi escreve no Jarvis (papel 'davi'); a sessão do
-- Claude fica ouvindo (scripts/jarvis-conversa.py esperar), responde e grava
-- a resposta (papel 'claude') com o script de admin.
--   status da mensagem do Davi: enviada → lida (Claude pensando) → respondida
CREATE TABLE IF NOT EXISTS public.jarvis_conversa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('davi', 'claude')),
  texto text NOT NULL CHECK (length(btrim(texto)) > 0),
  status text CHECK (status IN ('enviada', 'lida', 'respondida')),
  resposta_a uuid REFERENCES public.jarvis_conversa(id) ON DELETE SET NULL,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_conversa_user_criada_idx ON public.jarvis_conversa (user_id, criada_em);

ALTER TABLE public.jarvis_conversa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.jarvis_conversa FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Pelo app só se escreve como 'davi'; as respostas do Claude entram pelo script.
CREATE POLICY "account_owner_insert" ON public.jarvis_conversa FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND papel = 'davi' AND status = 'enviada');
CREATE POLICY "account_owner_delete" ON public.jarvis_conversa FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.jarvis_conversa TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_conversa;
