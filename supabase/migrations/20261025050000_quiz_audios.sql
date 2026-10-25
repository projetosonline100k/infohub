-- Quiz: o Davi envia também o áudio que falta (tela com "Falta: áudio…") direto no teste da revisão (25/10).
-- O mesmo balde quiz-imagens passa a aceitar áudio e arquivos até 20 MB (áudio pesa mais que foto).
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                               'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
                               'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'],
    file_size_limit = 20971520
where id = 'quiz-imagens';
