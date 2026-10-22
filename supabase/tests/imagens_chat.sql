-- Regressão: a policy de imagem do chat existe e só vale para a pasta chat/<usuário>/ com extensão de imagem.
BEGIN;
DO $$
DECLARE chk text;
BEGIN
  SELECT with_check INTO chk FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Entregas: imagem do chat na pasta do usuário';
  IF chk IS NULL OR chk NOT LIKE '%auth.uid()%' OR chk NOT LIKE '%chat%' THEN RAISE EXCEPTION 'policy do chat errada: %', chk; END IF;
END $$;
ROLLBACK;
