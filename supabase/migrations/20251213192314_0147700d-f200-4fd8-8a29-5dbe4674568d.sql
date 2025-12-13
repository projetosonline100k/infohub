-- Tabela para vídeos de referência que performaram
CREATE TABLE public.videos_referencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  thumbnail_url TEXT,
  link_video TEXT,
  plataforma TEXT DEFAULT 'instagram',
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para ideias de vídeo no Kanban
CREATE TABLE public.videos_vertical (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'ideia',
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.videos_referencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos_vertical ENABLE ROW LEVEL SECURITY;

-- RLS policies for videos_referencia
CREATE POLICY "Permitir leitura de videos_referencia" ON public.videos_referencia FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de videos_referencia" ON public.videos_referencia FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de videos_referencia" ON public.videos_referencia FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de videos_referencia" ON public.videos_referencia FOR DELETE USING (true);

-- RLS policies for videos_vertical
CREATE POLICY "Permitir leitura de videos_vertical" ON public.videos_vertical FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de videos_vertical" ON public.videos_vertical FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de videos_vertical" ON public.videos_vertical FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de videos_vertical" ON public.videos_vertical FOR DELETE USING (true);