-- Create table for custom influence core categories
CREATE TABLE public.categorias_nucleo (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL,
  titulo text NOT NULL,
  subtitulo text,
  cor text NOT NULL DEFAULT 'blue',
  ordem integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.categorias_nucleo ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Permitir leitura de categorias" 
ON public.categorias_nucleo 
FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de categorias" 
ON public.categorias_nucleo 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de categorias" 
ON public.categorias_nucleo 
FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de categorias" 
ON public.categorias_nucleo 
FOR DELETE USING (true);