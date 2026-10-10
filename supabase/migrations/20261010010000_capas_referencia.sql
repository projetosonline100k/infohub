-- Capas dos reels de referência (Ideias em destaque). O link de imagem do
-- Instagram expira em poucos dias, então o Jarvis guarda uma cópia aqui e
-- grava a URL pública em videos_referencia.thumbnail_url.
-- Caminho: <user_id>/<arquivo>.jpg — cada usuário só envia/apaga na sua pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas-referencia', 'capas-referencia', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Capas de referência são públicas para leitura"
  on storage.objects for select
  using (bucket_id = 'capas-referencia');

create policy "Usuário envia capas de referência na própria pasta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'capas-referencia' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Usuário apaga capas de referência da própria pasta"
  on storage.objects for delete to authenticated
  using (bucket_id = 'capas-referencia' and (storage.foldername(name))[1] = auth.uid()::text);
