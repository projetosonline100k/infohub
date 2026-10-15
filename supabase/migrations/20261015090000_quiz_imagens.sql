-- Imagens do quiz (pedido do Davi, 15/10/2026: quiz "dopaminérgico", com foto
-- do especialista, imagem nas perguntas e nas telas de respiro). O Davi envia
-- clicando na imagem em "Ver e aprovar"; a URL pública vai para a estrutura.
-- Caminho: <user_id>/<quiz_id>/<arquivo> — cada usuário só envia/apaga na sua pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-imagens', 'quiz-imagens', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Imagens de quiz são públicas para leitura"
  on storage.objects for select
  using (bucket_id = 'quiz-imagens');

create policy "Usuário envia imagens de quiz na própria pasta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'quiz-imagens' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Usuário apaga imagens de quiz da própria pasta"
  on storage.objects for delete to authenticated
  using (bucket_id = 'quiz-imagens' and (storage.foldername(name))[1] = auth.uid()::text);
