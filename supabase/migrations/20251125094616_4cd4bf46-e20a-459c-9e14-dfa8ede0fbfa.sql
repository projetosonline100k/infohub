-- Add new fields to clientes table
ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS meta_atual TEXT,
ADD COLUMN IF NOT EXISTS link_painel_receita TEXT;

-- Create produtos_cliente table
CREATE TABLE IF NOT EXISTS public.produtos_cliente (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome_produto TEXT NOT NULL,
  preco TEXT,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on produtos_cliente
ALTER TABLE public.produtos_cliente ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for produtos_cliente
CREATE POLICY "Permitir leitura de produtos" 
ON public.produtos_cliente 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserção de produtos" 
ON public.produtos_cliente 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir atualização de produtos" 
ON public.produtos_cliente 
FOR UPDATE 
USING (true);

CREATE POLICY "Permitir exclusão de produtos" 
ON public.produtos_cliente 
FOR DELETE 
USING (true);