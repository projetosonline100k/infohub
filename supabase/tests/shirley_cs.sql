-- A Shirley (CS) existe na Core, no escritório Sucesso do cliente, como IA que trabalha sozinha.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.membros WHERE lower(nome) = 'shirley' AND cliente_id = '814c070a-73cc-4604-8bec-be7520a0bddd'
                   AND setor_id = 'fe62e9fe-0b6f-4ae0-b733-b8be7cc5a95a' AND eh_ia AND autonomo AND ativo) THEN
    RAISE EXCEPTION 'Shirley não está na Core';
  END IF;
END $$;
