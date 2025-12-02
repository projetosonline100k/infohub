-- Add new columns to pesquisas table for welcome and completion messages
ALTER TABLE public.pesquisas 
ADD COLUMN mensagem_inicial text,
ADD COLUMN mensagem_final text,
ADD COLUMN link_final text,
ADD COLUMN link_final_texto text;

-- Add comments for documentation
COMMENT ON COLUMN public.pesquisas.mensagem_inicial IS 'Texto de introdução exibido antes das perguntas';
COMMENT ON COLUMN public.pesquisas.mensagem_final IS 'Mensagem exibida após concluir a pesquisa';
COMMENT ON COLUMN public.pesquisas.link_final IS 'URL do botão na tela de conclusão';
COMMENT ON COLUMN public.pesquisas.link_final_texto IS 'Texto do botão do link (ex: Acesse aqui)';