-- Tabela para armazenar as tags disponíveis por cliente
CREATE TABLE public.tags_video (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT 'blue',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabela de relacionamento entre vídeos e tags (many-to-many)
CREATE TABLE public.videos_vertical_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id uuid NOT NULL REFERENCES public.videos_vertical(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags_video(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(video_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.tags_video ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos_vertical_tags ENABLE ROW LEVEL SECURITY;

-- Policies para tags_video
CREATE POLICY "Permitir leitura de tags" ON public.tags_video FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de tags" ON public.tags_video FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de tags" ON public.tags_video FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de tags" ON public.tags_video FOR DELETE USING (true);

-- Policies para videos_vertical_tags
CREATE POLICY "Permitir leitura de video_tags" ON public.videos_vertical_tags FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de video_tags" ON public.videos_vertical_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir exclusão de video_tags" ON public.videos_vertical_tags FOR DELETE USING (true);