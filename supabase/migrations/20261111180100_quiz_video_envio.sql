-- Quiz: o Roy também envia o vídeo da oferta (11/11/2026), com o mesmo token de 1 hora: o nome do arquivo passa a poder
-- terminar em .mp4 ou .webm (só a extensão muda; pasta, token, quiz e status continuam como antes).
CREATE OR REPLACE FUNCTION public.quiz_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR partes[1] <> 'roy'
     OR caminho !~ '/[a-z0-9-]{1,60}\.(png|jpg|webp|mp4|webm)$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.quiz_envios e JOIN public.quizzes q ON q.id = e.quiz_id
    WHERE e.quiz_id = partes[2]::uuid AND e.token = partes[3]::uuid AND e.expira_em > now()
      AND q.status IN ('criando', 'revisar', 'publicado', 'pausado'));
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$function$;
