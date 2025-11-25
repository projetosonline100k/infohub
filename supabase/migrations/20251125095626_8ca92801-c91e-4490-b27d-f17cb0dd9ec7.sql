-- Create enum for survey types
CREATE TYPE tipo_pesquisa AS ENUM ('aberta', 'multipla', 'unica');

-- Create pesquisas table
CREATE TABLE public.pesquisas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo_pergunta TEXT NOT NULL,
  tipo tipo_pesquisa NOT NULL,
  opcoes JSONB DEFAULT '[]'::jsonb,
  link_publico TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create respostas_pesquisa table
CREATE TABLE public.respostas_pesquisa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pesquisa_id UUID NOT NULL REFERENCES public.pesquisas(id) ON DELETE CASCADE,
  resposta_texto TEXT,
  respostas_selecionadas JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pesquisas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas_pesquisa ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pesquisas
CREATE POLICY "Permitir leitura de pesquisas"
ON public.pesquisas FOR SELECT
USING (true);

CREATE POLICY "Permitir inserção de pesquisas"
ON public.pesquisas FOR INSERT
WITH CHECK (true);

CREATE POLICY "Permitir atualização de pesquisas"
ON public.pesquisas FOR UPDATE
USING (true);

CREATE POLICY "Permitir exclusão de pesquisas"
ON public.pesquisas FOR DELETE
USING (true);

-- RLS Policies for respostas_pesquisa
CREATE POLICY "Permitir inserção pública de respostas"
ON public.respostas_pesquisa FOR INSERT
WITH CHECK (true);

CREATE POLICY "Permitir leitura de respostas"
ON public.respostas_pesquisa FOR SELECT
USING (true);

-- Create index for better performance
CREATE INDEX idx_pesquisas_cliente_id ON public.pesquisas(cliente_id);
CREATE INDEX idx_respostas_pesquisa_id ON public.respostas_pesquisa(pesquisa_id);