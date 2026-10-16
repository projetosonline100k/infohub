-- Cobrança do Atlas no ouvinte (melhoria do Pedro, 16/10/2026): cada rodada
-- grava em servicos_sinal ('cobranca') o resultado ("publicou: …",
-- "manteve: …", "falhou: …"). A Visão geral mostra a última rodada.
ALTER TABLE public.servicos_sinal ADD COLUMN IF NOT EXISTS detalhe text;

NOTIFY pgrst, 'reload schema';
