-- Regressão: a identidade visual da V2 do Instalivros fica em estrutura.visual e a V1 não ganha nada.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7' AND estrutura #>> '{visual,botao}' = '#2CDAAB' AND estrutura->>'tema' = 'escuro') THEN
    RAISE EXCEPTION 'a V2 do Instalivros deveria ter o visual azul-marinho';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quizzes WHERE id::text LIKE 'dccceb2d%' AND estrutura ? 'visual') THEN
    RAISE EXCEPTION 'a V1 não pode ganhar visual';
  END IF;
END $$;
ROLLBACK;
