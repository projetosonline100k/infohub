-- Create table for custom AI agents
CREATE TABLE public.agentes_ia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  nome TEXT NOT NULL DEFAULT 'Assistente de Roteiros',
  persona TEXT,
  instrucoes TEXT,
  tom_voz TEXT DEFAULT 'informal',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agentes_ia ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Permitir leitura de agentes" ON public.agentes_ia FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de agentes" ON public.agentes_ia FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de agentes" ON public.agentes_ia FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de agentes" ON public.agentes_ia FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_agentes_ia_updated_at
  BEFORE UPDATE ON public.agentes_ia
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();