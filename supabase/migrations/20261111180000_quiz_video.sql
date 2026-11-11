-- Quiz: o Davi coloca um vídeo no fim da oferta (11/11/2026). O balde quiz-imagens passa a aceitar vídeo MP4/WebM
-- (o limite de 20 MB continua; o vídeo do quiz é comprimido antes, uns 2 MB, porque o quiz tem que abrir rápido).
update storage.buckets
set allowed_mime_types = (select array_agg(distinct t) from unnest(allowed_mime_types || array['video/mp4', 'video/webm']) t)
where id = 'quiz-imagens';
