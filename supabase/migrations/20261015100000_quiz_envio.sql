-- Imagens do quiz geradas pelo Roy (pedido do Davi, 15/10/2026). No Mac não há
-- chave de servidor, então segue o mesmo jeito das páginas do carrossel
-- (20261014070000_carrosseis_envio): a conexão de admin abre um token em
-- quiz_envios e o Storage aceita, com a chave pública, só em
-- quiz-imagens/roy/<quiz>/<token>/<arquivo> enquanto o token vale (1 hora)
-- e o quiz está criando ou em revisão. O app não lê essa tabela.
CREATE TABLE public.quiz_envios (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  expira_em timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);
ALTER TABLE public.quiz_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_envios FROM anon, authenticated;

CREATE FUNCTION public.quiz_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR partes[1] <> 'roy'
     OR caminho !~ '/[a-z0-9-]{1,60}\.(png|jpg|webp)$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.quiz_envios e JOIN public.quizzes q ON q.id = e.quiz_id
    WHERE e.quiz_id = partes[2]::uuid AND e.token = partes[3]::uuid AND e.expira_em > now()
      AND q.status IN ('criando', 'revisar'));
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.quiz_envio_permitido(text) FROM public;
GRANT EXECUTE ON FUNCTION public.quiz_envio_permitido(text) TO anon, authenticated;

CREATE POLICY "Roy envia imagens do quiz em revisão"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'quiz-imagens' AND public.quiz_envio_permitido(name));

NOTIFY pgrst, 'reload schema';
