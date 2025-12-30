
-- Create documentos table
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  atividade_id UUID REFERENCES public.atividades(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL DEFAULT 'Documento sem título',
  conteudo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Permitir leitura de documentos" ON public.documentos FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de documentos" ON public.documentos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de documentos" ON public.documentos FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de documentos" ON public.documentos FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_documentos_updated_at
  BEFORE UPDATE ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
