-- Add data_postagem column to videos_vertical
ALTER TABLE videos_vertical ADD COLUMN data_postagem DATE;

-- Add data_postagem column to videos_youtube
ALTER TABLE videos_youtube ADD COLUMN data_postagem DATE;