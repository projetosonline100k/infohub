-- Add secao column to perguntas_pesquisa table
ALTER TABLE public.perguntas_pesquisa 
ADD COLUMN secao integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.perguntas_pesquisa.secao IS 'Número da seção/página onde a pergunta aparece';