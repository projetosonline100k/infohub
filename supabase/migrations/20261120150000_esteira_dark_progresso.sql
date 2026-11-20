-- Barra de progresso do roteiro dark (20/11/2026, Davi: "poderia ter uma barra de prévia para eu saber como está o andamento").
-- O Lauro marca a etapa e a porcentagem enquanto produz (scripts/lauro/roteiros.py progresso); o calendário e o estúdio mostram a barra.
ALTER TABLE public.esteira_dark_roteiros ADD COLUMN IF NOT EXISTS progresso smallint CHECK (progresso BETWEEN 0 AND 100);
ALTER TABLE public.esteira_dark_roteiros ADD COLUMN IF NOT EXISTS etapa text;
ALTER TABLE public.esteira_dark_roteiros ADD COLUMN IF NOT EXISTS progresso_em timestamptz;
NOTIFY pgrst, 'reload schema';
