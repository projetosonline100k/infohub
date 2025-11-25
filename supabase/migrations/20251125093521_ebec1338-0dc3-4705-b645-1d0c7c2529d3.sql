-- Criar tabela de clientes
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_especialista TEXT NOT NULL,
  idade INTEGER NOT NULL CHECK (idade >= 18),
  nicho TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de equipe do cliente
CREATE TABLE public.equipe_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome_pessoa TEXT NOT NULL,
  papel TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS nas tabelas
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_cliente ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para clientes (permitir todos os usuários por enquanto)
CREATE POLICY "Permitir leitura de clientes" 
  ON public.clientes 
  FOR SELECT 
  USING (true);

CREATE POLICY "Permitir inserção de clientes" 
  ON public.clientes 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de clientes" 
  ON public.clientes 
  FOR UPDATE 
  USING (true);

CREATE POLICY "Permitir exclusão de clientes" 
  ON public.clientes 
  FOR DELETE 
  USING (true);

-- Políticas de acesso para equipe_cliente
CREATE POLICY "Permitir leitura de equipe" 
  ON public.equipe_cliente 
  FOR SELECT 
  USING (true);

CREATE POLICY "Permitir inserção de equipe" 
  ON public.equipe_cliente 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de equipe" 
  ON public.equipe_cliente 
  FOR UPDATE 
  USING (true);

CREATE POLICY "Permitir exclusão de equipe" 
  ON public.equipe_cliente 
  FOR DELETE 
  USING (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();