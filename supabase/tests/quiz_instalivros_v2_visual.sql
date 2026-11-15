-- Regressão: a identidade visual da V2 do Instalivros fica em estrutura.visual e a V1 não ganha nada.
BEGIN;
DO $$
BEGIN
  -- 15/11: o Davi voltou a V2 para o tema claro (sem estrutura.visual); a identidade azul não é mais exigida.
  IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7' AND estrutura->>'escala_visual' = 'velocimetro') THEN
    RAISE EXCEPTION 'a V2 do Instalivros deveria ter as escalas em velocímetro';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quizzes WHERE id::text LIKE 'dccceb2d%' AND estrutura ? 'escala_visual') THEN
    RAISE EXCEPTION 'a V1 mantém a trilha reta';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quizzes WHERE id::text LIKE 'dccceb2d%' AND estrutura ? 'visual') THEN
    RAISE EXCEPTION 'a V1 não pode ganhar visual';
  END IF;
END $$;
ROLLBACK;
