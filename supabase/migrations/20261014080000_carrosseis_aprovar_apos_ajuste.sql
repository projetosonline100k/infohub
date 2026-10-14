-- "Aprovar" com páginas excluídas ou texto editado na tela: o Roy precisa
-- remontar (a numeração 01/07 muda), mas o Davi não quer revisar de novo.
-- O app manda o ajuste com aprovar_apos_ajuste = true; o serviço do Roy
-- (scripts/roy/servico.py) remonta e, se a revisão automática passar, já
-- aprova e cria a tarefa da Dalila.
ALTER TABLE public.carrosseis ADD COLUMN aprovar_apos_ajuste boolean NOT NULL DEFAULT false;
GRANT SELECT (aprovar_apos_ajuste), UPDATE (aprovar_apos_ajuste) ON public.carrosseis TO authenticated;
NOTIFY pgrst, 'reload schema';
