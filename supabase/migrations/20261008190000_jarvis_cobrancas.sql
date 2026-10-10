-- Cobrança inteligente do Jarvis: a cada 30 min uma tarefa agendada do
-- Claude olha atividades, plano do dia, foco recente, WhatsApp e cobranças
-- anteriores, escolhe a UMA coisa mais importante e publica aqui
-- (scripts/cobranca-jarvis.py). O Jarvis mostra até o Davi responder.
--   status: ativa → feita | adiada (até adiada_ate) | descartada | substituida
CREATE TABLE IF NOT EXISTS public.jarvis_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  texto text NOT NULL,
  motivo text,
  urgencia smallint NOT NULL DEFAULT 2 CHECK (urgencia BETWEEN 1 AND 3),
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'feita', 'adiada', 'descartada', 'substituida')),
  adiada_ate timestamptz,
  vezes_adiada smallint NOT NULL DEFAULT 0,
  -- O que o Davi respondeu (ex.: por que não é prioridade) — o Claude lê
  -- isso na próxima rodada pra não insistir no que não faz sentido.
  resposta text,
  criada_em timestamptz NOT NULL DEFAULT now(),
  respondida_em timestamptz
);

CREATE INDEX IF NOT EXISTS jarvis_cobrancas_user_criada_idx ON public.jarvis_cobrancas (user_id, criada_em DESC);

ALTER TABLE public.jarvis_cobrancas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.jarvis_cobrancas FOR SELECT TO authenticated USING (user_id = auth.uid());
-- O app só responde (muda status/adiamento/resposta); quem cria é o script.
CREATE POLICY "account_owner_update" ON public.jarvis_cobrancas FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Tabelas novas nascem com tudo liberado pro authenticated (default do
-- Supabase): revoga e libera só o necessário.
REVOKE ALL ON public.jarvis_cobrancas FROM anon, authenticated;
GRANT SELECT, UPDATE (status, adiada_ate, vezes_adiada, resposta, respondida_em) ON public.jarvis_cobrancas TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_cobrancas;
