-- Bucket para imagens novas coladas/soltas no Mapa Mental (Excalidraw).
-- Antes iam embutidas em base64 dentro de documentos.conteudo, inflando a
-- linha (até 3MB numa só) e sendo baixadas por inteiro a cada leitura,
-- autosave e broadcast de colaboração — o maior gerador de egress do
-- projeto. Mapas antigos continuam com suas imagens em base64 (sem
-- migração retroativa); só as novas passam a usar este bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('mapa-mental-imagens', 'mapa-mental-imagens', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Imagens do mapa mental são públicas para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'mapa-mental-imagens');

CREATE POLICY "Autenticados podem enviar imagens do mapa mental"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'mapa-mental-imagens' AND auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem atualizar imagens do mapa mental"
ON storage.objects FOR UPDATE
USING (bucket_id = 'mapa-mental-imagens' AND auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem excluir imagens do mapa mental"
ON storage.objects FOR DELETE
USING (bucket_id = 'mapa-mental-imagens' AND auth.role() = 'authenticated');
