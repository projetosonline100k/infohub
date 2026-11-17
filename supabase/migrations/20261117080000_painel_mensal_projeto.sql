-- Meta de faturamento de cada projeto no mês (17/11/2026, Davi: "metas individuais em cada projeto e aí somar na meta do mês"). Pessoal de cada usuário.
CREATE TABLE public.painel_mensal_projeto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mes date NOT NULL CHECK (extract(day FROM mes) = 1),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  meta_faturamento numeric NOT NULL CHECK (meta_faturamento >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mes, cliente_id)
);
ALTER TABLE public.painel_mensal_projeto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.painel_mensal_projeto FROM anon, authenticated;
CREATE POLICY dono_le ON public.painel_mensal_projeto FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dono_cria ON public.painel_mensal_projeto FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_muda ON public.painel_mensal_projeto FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_apaga ON public.painel_mensal_projeto FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, DELETE ON public.painel_mensal_projeto TO authenticated;
GRANT INSERT (mes, cliente_id, meta_faturamento) ON public.painel_mensal_projeto TO authenticated;
GRANT UPDATE (meta_faturamento, atualizado_em) ON public.painel_mensal_projeto TO authenticated;
