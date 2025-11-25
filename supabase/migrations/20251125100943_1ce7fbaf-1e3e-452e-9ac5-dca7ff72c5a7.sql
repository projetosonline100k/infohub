-- Create perguntas_pesquisa table
CREATE TABLE IF NOT EXISTS public.perguntas_pesquisa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pesquisa_id UUID NOT NULL REFERENCES public.pesquisas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tipo public.tipo_pesquisa NOT NULL,
  opcoes JSONB DEFAULT '[]'::jsonb,
  ordem INTEGER NOT NULL,
  obrigatoria BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.perguntas_pesquisa ENABLE ROW LEVEL SECURITY;

-- RLS Policies for perguntas_pesquisa
CREATE POLICY "Permitir leitura de perguntas"
  ON public.perguntas_pesquisa
  FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserção de perguntas"
  ON public.perguntas_pesquisa
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de perguntas"
  ON public.perguntas_pesquisa
  FOR UPDATE
  USING (true);

CREATE POLICY "Permitir exclusão de perguntas"
  ON public.perguntas_pesquisa
  FOR DELETE
  USING (true);

-- Migrate existing data from pesquisas to perguntas_pesquisa
INSERT INTO public.perguntas_pesquisa (pesquisa_id, titulo, tipo, opcoes, ordem, obrigatoria)
SELECT 
  id as pesquisa_id,
  titulo_pergunta as titulo,
  tipo,
  COALESCE(opcoes, '[]'::jsonb) as opcoes,
  1 as ordem,
  true as obrigatoria
FROM public.pesquisas
WHERE titulo_pergunta IS NOT NULL;

-- Add new columns to pesquisas table
ALTER TABLE public.pesquisas 
  ADD COLUMN IF NOT EXISTS titulo TEXT;

-- Migrate titulo_pergunta to titulo (for existing records)
UPDATE public.pesquisas 
SET titulo = titulo_pergunta 
WHERE titulo IS NULL AND titulo_pergunta IS NOT NULL;

-- Now we can drop the old columns (but keep them for now to avoid data loss)
-- We'll just ignore them in the application

-- Add columns to respostas_pesquisa
ALTER TABLE public.respostas_pesquisa
  ADD COLUMN IF NOT EXISTS respondente_id TEXT,
  ADD COLUMN IF NOT EXISTS pergunta_id UUID REFERENCES public.perguntas_pesquisa(id) ON DELETE CASCADE;

-- Migrate existing respostas to link with perguntas
UPDATE public.respostas_pesquisa rp
SET 
  respondente_id = rp.id::text,
  pergunta_id = (
    SELECT pp.id 
    FROM public.perguntas_pesquisa pp 
    WHERE pp.pesquisa_id = rp.pesquisa_id 
    ORDER BY pp.ordem 
    LIMIT 1
  )
WHERE pergunta_id IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_perguntas_pesquisa_pesquisa_id ON public.perguntas_pesquisa(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_perguntas_pesquisa_ordem ON public.perguntas_pesquisa(pesquisa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_respostas_pergunta_id ON public.respostas_pesquisa(pergunta_id);
CREATE INDEX IF NOT EXISTS idx_respostas_respondente_id ON public.respostas_pesquisa(respondente_id);