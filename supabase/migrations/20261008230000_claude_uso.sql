-- Uso do plano do Claude (limite de 5h e semanal), mostrado no Jarvis pra
-- o Davi controlar o gasto. Quem lê é uma sessão do Claude (ferramenta de
-- uso do app desktop) e publica aqui com scripts/uso-claude.py; o app só lê.
CREATE TABLE IF NOT EXISTS public.claude_uso (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plano text,
  janela_5h_pct smallint,
  janela_5h_renova_em timestamptz,
  semanal_pct smallint,
  semanal_renova_em timestamptz,
  extra_ativo boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.claude_uso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.claude_uso FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.claude_uso FROM anon, authenticated;
GRANT SELECT ON public.claude_uso TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.claude_uso;
