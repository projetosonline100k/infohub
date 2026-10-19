-- Áudio gravado dentro do documento (18/10/2026, Davi: "ao lado do cursor um microfone; ao
-- clicar, gravar um áudio já com a transcrição; ouvir, acelerar, clicar na parte específica").
-- O áudio fica aqui; o bloco no documento guarda a URL e os trechos da transcrição com o tempo.
-- Caminho: <user_id>/<uuid>.<ext> — nome impossível de adivinhar; cada um só envia/apaga na sua pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios-documentos', 'audios-documentos', true, 52428800,
        array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac'])
on conflict (id) do nothing;

create policy "Áudios dos documentos: leitura pelo link"
  on storage.objects for select
  using (bucket_id = 'audios-documentos');

create policy "Usuário envia áudios de documento na própria pasta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'audios-documentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Usuário apaga áudios de documento da própria pasta"
  on storage.objects for delete to authenticated
  using (bucket_id = 'audios-documentos' and (storage.foldername(name))[1] = auth.uid()::text);
