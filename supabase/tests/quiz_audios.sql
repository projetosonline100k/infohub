BEGIN;
-- O balde do quiz aceita áudio (mp3/m4a) além das imagens.
do $$
declare tipos text[];
begin
  select allowed_mime_types into tipos from storage.buckets where id = 'quiz-imagens';
  if not ('audio/mpeg' = any(tipos) and 'audio/x-m4a' = any(tipos) and 'image/png' = any(tipos)) then
    raise exception 'quiz-imagens devia aceitar áudio e imagem: %', tipos;
  end if;
end $$;
ROLLBACK;
