-- Add banner_url column to pesquisas table
ALTER TABLE public.pesquisas
ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Create storage bucket for survey banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('survey-banners', 'survey-banners', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for survey banners bucket
CREATE POLICY "Public can view survey banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'survey-banners');

CREATE POLICY "Authenticated users can upload survey banners"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'survey-banners');

CREATE POLICY "Authenticated users can update their survey banners"
ON storage.objects FOR UPDATE
USING (bucket_id = 'survey-banners');

CREATE POLICY "Authenticated users can delete their survey banners"
ON storage.objects FOR DELETE
USING (bucket_id = 'survey-banners');