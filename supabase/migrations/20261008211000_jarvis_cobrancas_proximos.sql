-- "Depois disso": as próximas 2-3 coisas da fila (curtas), mostradas no
-- card da cobrança abaixo do primeiro passo.
ALTER TABLE public.jarvis_cobrancas ADD COLUMN IF NOT EXISTS proximos text[] NOT NULL DEFAULT '{}';
