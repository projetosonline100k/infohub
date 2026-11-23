-- Quiz: a migração do áudio (20261119040000) tirou mp4/webm do envio e o status "pausado" da função quiz_envio_permitido,
-- e o vídeo da oferta voltou a ser recusado (23/11/2026, vídeo do Instalingo). Aqui a função aceita as duas listas juntas.
CREATE OR REPLACE FUNCTION public.quiz_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR partes[1] <> 'roy'
     OR caminho !~ '/[a-z0-9-]{1,60}\.(png|jpg|webp|m4a|mp3|mp4|webm)$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.quiz_envios e JOIN public.quizzes q ON q.id = e.quiz_id
    WHERE e.quiz_id = partes[2]::uuid AND e.token = partes[3]::uuid AND e.expira_em > now()
      AND q.status IN ('criando', 'revisar', 'publicado', 'pausado'));
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$function$;
