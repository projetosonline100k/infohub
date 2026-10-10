-- Comentário livre numa ideia (detalhes da ideia em "Ideias em destaque").
-- As policies de videos_vertical já cobrem a coluna nova.
alter table public.videos_vertical add column if not exists comentario text;
