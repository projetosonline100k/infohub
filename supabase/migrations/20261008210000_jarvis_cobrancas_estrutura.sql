-- Cobrança mais fácil de ler: em vez de um texto corrido, o Claude manda
-- até 3 fatos curtos (o porquê), o primeiro passo e quanto tempo leva, e
-- uma etiqueta curta (ex.: "Cliente esperando"). `texto` continua como
-- reserva pra cobranças antigas.
ALTER TABLE public.jarvis_cobrancas
  ADD COLUMN IF NOT EXISTS etiqueta text,
  ADD COLUMN IF NOT EXISTS fatos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primeiro_passo text,
  ADD COLUMN IF NOT EXISTS minutos smallint CHECK (minutos IS NULL OR minutos BETWEEN 1 AND 600);
