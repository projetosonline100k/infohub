-- Amostras de áudio do quiz Instalivros v2 pelo Mac (19/11/2026, Davi): a policy de envio do Roy só aceitava imagem e
-- quiz em criando/revisar. Agora o mesmo caminho com token (aberto só pela conexão de admin, vale 1 hora) também aceita
-- áudio (m4a/mp3) e quiz publicado (o rascunho é editado e o Davi publica depois). O balde já aceita audio/mp4 e audio/mpeg.
CREATE OR REPLACE FUNCTION public.quiz_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR partes[1] <> 'roy'
     OR caminho !~ '/[a-z0-9-]{1,60}\.(png|jpg|webp|m4a|mp3)$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.quiz_envios e JOIN public.quizzes q ON q.id = e.quiz_id
    WHERE e.quiz_id = partes[2]::uuid AND e.token = partes[3]::uuid AND e.expira_em > now()
      AND q.status IN ('criando', 'revisar', 'publicado'));
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;
NOTIFY pgrst, 'reload schema';
