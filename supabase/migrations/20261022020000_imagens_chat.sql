-- Imagens no chat dos funcionários (22/10, Davi: "tirar um print e arrastar para o chat, e ele identificar").
-- Quem está logado sobe no bucket público 'entregas', só na própria pasta chat/<usuário>/.
DROP POLICY IF EXISTS "Entregas: imagem do chat na pasta do usuário" ON storage.objects;
CREATE POLICY "Entregas: imagem do chat na pasta do usuário" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entregas' AND (storage.foldername(name))[1] = 'chat'
              AND (storage.foldername(name))[2] = auth.uid()::text
              AND name ~* '\.(png|jpe?g|webp|gif)$');
