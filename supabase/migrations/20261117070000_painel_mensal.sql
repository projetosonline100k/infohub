-- Meta de faturamento do MÊS para a Visão da semana (17/11/2026, Davi: "no faturamento é do mês"). Pessoal de cada usuário.
CREATE TABLE public.painel_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mes date NOT NULL CHECK (extract(day FROM mes) = 1),   -- primeiro dia do mês
  meta_faturamento numeric CHECK (meta_faturamento IS NULL OR meta_faturamento >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mes)
);
ALTER TABLE public.painel_mensal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.painel_mensal FROM anon, authenticated;
CREATE POLICY dono_le ON public.painel_mensal FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dono_cria ON public.painel_mensal FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_muda ON public.painel_mensal FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_apaga ON public.painel_mensal FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, DELETE ON public.painel_mensal TO authenticated;
GRANT INSERT (mes, meta_faturamento) ON public.painel_mensal TO authenticated;
GRANT UPDATE (meta_faturamento, atualizado_em) ON public.painel_mensal TO authenticated;
