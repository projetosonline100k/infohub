-- Tarefa do Roy → carrossel: quando o Davi passa uma atividade pro Roy, o
-- serviço dele (scripts/roy/servico.py) cria o carrossel e liga aqui a tarefa
-- de origem. Ao aprovar todos os carrosséis dessa tarefa, ela é concluída.
-- (atividade_id continua sendo a tarefa da Dalila, criada na aprovação.)
ALTER TABLE public.carrosseis ADD COLUMN IF NOT EXISTS atividade_roy_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS carrosseis_atividade_roy_idx ON public.carrosseis (atividade_roy_id) WHERE atividade_roy_id IS NOT NULL;
GRANT SELECT (atividade_roy_id) ON public.carrosseis TO authenticated;
NOTIFY pgrst, 'reload schema';
