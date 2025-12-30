-- Adicionar novos campos à tabela atividades
ALTER TABLE public.atividades 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'media',
ADD COLUMN IF NOT EXISTS data_vencimento date,
ADD COLUMN IF NOT EXISTS data_inicio date;

-- Criar tabela de subtarefas
CREATE TABLE IF NOT EXISTS public.subtarefas_atividade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atividade_id UUID NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for subtarefas
ALTER TABLE public.subtarefas_atividade ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for subtarefas
CREATE POLICY "Permitir leitura de subtarefas" ON public.subtarefas_atividade FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de subtarefas" ON public.subtarefas_atividade FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de subtarefas" ON public.subtarefas_atividade FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de subtarefas" ON public.subtarefas_atividade FOR DELETE USING (true);

-- Create index for subtarefas
CREATE INDEX IF NOT EXISTS idx_subtarefas_atividade_id ON public.subtarefas_atividade(atividade_id);