-- Visão da semana do Dash geral (17/11/2026, Davi: "no dash geral, quero criar algo parecido com esse dash, e que seja funcional"):
-- meta de faturamento da semana, "Missão da Semana" (checklist) e quais projetos aparecem nos cartões. Pessoal de cada usuário.
CREATE TABLE public.painel_semanal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  semana date NOT NULL CHECK (extract(isodow FROM semana) = 1),   -- a segunda-feira da semana
  meta_faturamento numeric CHECK (meta_faturamento IS NULL OR meta_faturamento >= 0),
  missao jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missao) = 'array' AND jsonb_array_length(missao) <= 30),   -- [{id, texto, feito}]
  projetos uuid[],                                                   -- null = escolha automática
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, semana)
);
ALTER TABLE public.painel_semanal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.painel_semanal FROM anon, authenticated;
CREATE POLICY dono_le ON public.painel_semanal FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dono_cria ON public.painel_semanal FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_muda ON public.painel_semanal FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_apaga ON public.painel_semanal FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, DELETE ON public.painel_semanal TO authenticated;
GRANT INSERT (semana, meta_faturamento, missao, projetos) ON public.painel_semanal TO authenticated;
GRANT UPDATE (meta_faturamento, missao, projetos, atualizado_em) ON public.painel_semanal TO authenticated;
