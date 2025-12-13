-- Add escalado and referencia_id columns to videos_vertical
ALTER TABLE public.videos_vertical 
ADD COLUMN escalado boolean NOT NULL DEFAULT false,
ADD COLUMN referencia_id uuid REFERENCES public.videos_referencia(id) ON DELETE SET NULL;