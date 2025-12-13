-- Adicionar campo roteiro à tabela videos_vertical
ALTER TABLE public.videos_vertical ADD COLUMN roteiro text;

-- Criar tabela para vídeos do YouTube
CREATE TABLE public.videos_youtube (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  titulo text NOT NULL,
  descricao text,
  roteiro text,
  status text NOT NULL DEFAULT 'ideia',
  ordem integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.videos_youtube ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para videos_youtube
CREATE POLICY "Permitir leitura de videos_youtube" 
ON public.videos_youtube FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de videos_youtube" 
ON public.videos_youtube FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de videos_youtube" 
ON public.videos_youtube FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de videos_youtube" 
ON public.videos_youtube FOR DELETE USING (true);