-- Create atividades table
CREATE TABLE public.atividades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  concluida BOOLEAN NOT NULL DEFAULT false,
  tempo_estimado INTEGER, -- em minutos
  data_atividade DATE NOT NULL DEFAULT CURRENT_DATE,
  ordem INTEGER NOT NULL DEFAULT 1,
  destaque BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.atividades ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Permitir leitura de atividades"
ON public.atividades
FOR SELECT
USING (true);

CREATE POLICY "Permitir inserção de atividades"
ON public.atividades
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Permitir atualização de atividades"
ON public.atividades
FOR UPDATE
USING (true);

CREATE POLICY "Permitir exclusão de atividades"
ON public.atividades
FOR DELETE
USING (true);

-- Index for better performance
CREATE INDEX idx_atividades_cliente_id ON public.atividades(cliente_id);
CREATE INDEX idx_atividades_data ON public.atividades(data_atividade);