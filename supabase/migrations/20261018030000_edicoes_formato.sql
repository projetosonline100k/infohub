-- Formato da edição do Danilo (pedido do Davi, 18/10): antes de editar, o
-- Danilo pergunta o formato e mostra duas imagens feitas com o próprio bruto.
--  'classico' = pinturas + legendas (o de sempre);
--  'papel'    = tela dividida: papel desenhado à mão em cima, o Davi embaixo.
-- status 'escolher_formato' → o Davi escolhe no Infopro (formato + status
-- 'na_fila') → o serviço do Danilo edita naquele formato.
ALTER TABLE public.edicoes_video DROP CONSTRAINT IF EXISTS edicoes_video_status_check;
ALTER TABLE public.edicoes_video ADD CONSTRAINT edicoes_video_status_check CHECK (status IN
  ('na_fila', 'escolher_formato', 'editando', 'revisar', 'renderizando', 'aprovando', 'aprovado', 'erro', 'cancelado'));
ALTER TABLE public.edicoes_video
  ADD COLUMN formato text CHECK (formato IN ('classico', 'papel')),
  ADD COLUMN opcoes_formato jsonb;          -- {"classico": url, "papel": url} (imagens de exemplo no bucket)
GRANT SELECT (formato, opcoes_formato) ON public.edicoes_video TO authenticated;
GRANT UPDATE (formato) ON public.edicoes_video TO authenticated;

-- Imagens de exemplo do formato também sobem pelo token da edição.
UPDATE storage.buckets SET allowed_mime_types = ARRAY['video/mp4', 'application/json', 'image/jpeg'] WHERE id = 'edicoes';
CREATE OR REPLACE FUNCTION public.edicao_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3
     OR caminho !~ '/(previa-v[0-9]+\.mp4|ondas-v[0-9]+\.json|formato-(classico|papel)\.jpg)$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.edicoes_video e
    WHERE e.cliente_id = partes[1]::uuid AND e.id = partes[2]::uuid AND e.token_envio = partes[3]::uuid);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

NOTIFY pgrst, 'reload schema';
