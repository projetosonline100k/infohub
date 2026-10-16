-- Aviso de equipe de IAs sem conexão (melhoria do Pedro, 16/10/2026): o
-- ouvinte do Atlas grava aqui um "último sinal" a cada minuto. A Visão geral
-- mostra "equipe sem conexão desde HH:MM" quando passa de 3 min sem sinal.
-- Só o ouvinte grava (usuário admin do banco); o app só lê o do próprio dono.
CREATE TABLE public.servicos_sinal (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  servico text NOT NULL,                      -- 'ouvinte' (dá pra somar Roy/Danilo depois)
  ultimo_sinal timestamptz NOT NULL DEFAULT now(),
  iniciado_em timestamptz,                    -- quando o serviço subiu pela última vez
  PRIMARY KEY (user_id, servico)
);
ALTER TABLE public.servicos_sinal ENABLE ROW LEVEL SECURITY;
CREATE POLICY servicos_sinal_select ON public.servicos_sinal
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.servicos_sinal FROM anon, authenticated;
GRANT SELECT ON public.servicos_sinal TO authenticated;

NOTIFY pgrst, 'reload schema';
