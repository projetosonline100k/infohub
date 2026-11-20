-- Correção da 20261120150000 (20/11/2026): esteira_dark_roteiros libera leitura coluna por coluna para o app; sem isto a consulta do calendário
-- (que pede progresso/etapa/progresso_em) era recusada inteira e a lista de roteiros aparecia vazia.
GRANT SELECT (progresso, etapa, progresso_em) ON public.esteira_dark_roteiros TO authenticated;
NOTIFY pgrst, 'reload schema';
