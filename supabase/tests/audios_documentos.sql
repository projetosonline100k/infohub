-- O bucket dos áudios do documento existe, aceita áudio e só deixa enviar na própria pasta.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'audios-documentos' AND 'audio/mp4' = ANY(allowed_mime_types)) THEN
    RAISE EXCEPTION 'bucket audios-documentos ausente ou sem audio/mp4';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname = 'Usuário envia áudios de documento na própria pasta' AND with_check ILIKE '%foldername%') THEN
    RAISE EXCEPTION 'envio de áudio sem a trava da própria pasta';
  END IF;
END $$;
ROLLBACK;
