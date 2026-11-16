-- Mídia nos fluxos de mensagem (16/11/2026, Davi: "dá para mandar foto e áudio junto com a mensagem? pode criar"): bloco "Mídia" (foto, áudio, vídeo, PDF) no Many Hub e no WhatsApp.
-- Os arquivos ficam num balde público (o WhatsApp/Meta precisam abrir o endereço), na pasta de quem enviou.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (
  'fluxo-midias', 'fluxo-midias', true, 52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm',
        'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Fluxo midias: leitura pública" ON storage.objects FOR SELECT USING (bucket_id = 'fluxo-midias');
CREATE POLICY "Fluxo midias: envia na própria pasta" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fluxo-midias' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Fluxo midias: apaga da própria pasta" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fluxo-midias' AND (storage.foldername(name))[1] = auth.uid()::text);
