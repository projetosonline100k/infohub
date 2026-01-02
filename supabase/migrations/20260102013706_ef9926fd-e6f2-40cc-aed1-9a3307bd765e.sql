-- Adicionar campo de origem nas duas tabelas para rastrear de onde veio o vídeo
ALTER TABLE videos_vertical ADD COLUMN origem_plataforma TEXT DEFAULT NULL;
ALTER TABLE videos_youtube ADD COLUMN origem_plataforma TEXT DEFAULT NULL;