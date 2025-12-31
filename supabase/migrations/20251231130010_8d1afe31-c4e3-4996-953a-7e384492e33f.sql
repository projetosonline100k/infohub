-- Create table for daily financial records
CREATE TABLE public.produto_financeiro_diario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL,
  data DATE NOT NULL,
  receita NUMERIC DEFAULT 0,
  custos NUMERIC DEFAULT 0,
  reembolsos NUMERIC DEFAULT 0,
  vendas_quantidade INTEGER DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(produto_id, data)
);

-- Enable Row Level Security
ALTER TABLE public.produto_financeiro_diario ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Permitir leitura de financeiro diario" 
ON public.produto_financeiro_diario 
FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserção de financeiro diario" 
ON public.produto_financeiro_diario 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir atualização de financeiro diario" 
ON public.produto_financeiro_diario 
FOR UPDATE 
USING (true);

CREATE POLICY "Permitir exclusão de financeiro diario" 
ON public.produto_financeiro_diario 
FOR DELETE 
USING (true);