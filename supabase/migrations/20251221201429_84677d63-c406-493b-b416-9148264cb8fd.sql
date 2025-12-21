-- Criar tabela para termos virais
CREATE TABLE public.termos_virais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL,
  termo TEXT NOT NULL,
  categoria TEXT DEFAULT 'geral',
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.termos_virais ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Permitir leitura de termos virais"
ON public.termos_virais FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de termos virais"
ON public.termos_virais FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de termos virais"
ON public.termos_virais FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de termos virais"
ON public.termos_virais FOR DELETE USING (true);