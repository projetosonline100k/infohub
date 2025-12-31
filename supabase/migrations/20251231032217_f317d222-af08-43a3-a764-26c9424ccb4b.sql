-- Adicionar novos campos à tabela produtos_cliente
ALTER TABLE public.produtos_cliente 
ADD COLUMN IF NOT EXISTS descricao TEXT,
ADD COLUMN IF NOT EXISTS links_checkout JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS acesso_url TEXT,
ADD COLUMN IF NOT EXISTS acesso_instrucoes TEXT,
ADD COLUMN IF NOT EXISTS ideias TEXT;

-- Criar tabela para os nós do funil de vendas
CREATE TABLE public.funil_vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos_cliente(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.funil_vendas(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  cor TEXT DEFAULT 'blue',
  posicao_x FLOAT DEFAULT 0,
  posicao_y FLOAT DEFAULT 0,
  ordem INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funil_vendas ENABLE ROW LEVEL SECURITY;

-- RLS policies for funil_vendas
CREATE POLICY "Permitir leitura de funil" ON public.funil_vendas FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de funil" ON public.funil_vendas FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de funil" ON public.funil_vendas FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de funil" ON public.funil_vendas FOR DELETE USING (true);

-- Criar tabela para dados financeiros do produto
CREATE TABLE public.produto_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos_cliente(id) ON DELETE CASCADE,
  mes TEXT NOT NULL,
  receita_bruta DECIMAL(12,2) DEFAULT 0,
  custos DECIMAL(12,2) DEFAULT 0,
  reembolsos DECIMAL(12,2) DEFAULT 0,
  vendas_quantidade INTEGER DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(produto_id, mes)
);

-- Enable RLS
ALTER TABLE public.produto_financeiro ENABLE ROW LEVEL SECURITY;

-- RLS policies for produto_financeiro
CREATE POLICY "Permitir leitura de financeiro" ON public.produto_financeiro FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de financeiro" ON public.produto_financeiro FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de financeiro" ON public.produto_financeiro FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de financeiro" ON public.produto_financeiro FOR DELETE USING (true);