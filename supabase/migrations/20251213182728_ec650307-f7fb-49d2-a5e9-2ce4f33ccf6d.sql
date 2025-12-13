-- Adicionar colunas de plataforma e link de referência na tabela ideias_conteudo
ALTER TABLE public.ideias_conteudo 
ADD COLUMN plataformas TEXT[] DEFAULT '{}',
ADD COLUMN link_referencia TEXT;