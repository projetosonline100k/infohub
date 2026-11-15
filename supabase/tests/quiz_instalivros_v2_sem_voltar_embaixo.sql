-- Regressão: a V2 do Instalivros não mostra o "← Voltar" de baixo; a V1 não ganha a chave.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7' AND estrutura->'voltar_embaixo' = 'false'::jsonb) THEN
    RAISE EXCEPTION 'a V2 do Instalivros deveria ter voltar_embaixo = false';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quizzes WHERE id::text LIKE 'dccceb2d%' AND estrutura ? 'voltar_embaixo') THEN
    RAISE EXCEPTION 'a V1 mantém o Voltar de baixo';
  END IF;
END $$;
ROLLBACK;
