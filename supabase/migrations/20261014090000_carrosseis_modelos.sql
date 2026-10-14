-- Prévia ao vivo na revisão: o Roy grava, por página, o molde HTML (o mesmo
-- que vira o PNG) com __TITULO__ e __TEXTO__ no lugar do texto. Quando o Davi
-- edita, o app desenha a página na hora com o texto novo. Fontes e
-- ilustrações do molde vão no Storage, em <cliente>/<carrossel>/<token>/assets/.
ALTER TABLE public.carrosseis ADD COLUMN modelos text[] NOT NULL DEFAULT '{}';
GRANT SELECT (modelos) ON public.carrosseis TO authenticated;

UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'font/ttf', 'font/otf']
WHERE id = 'carrosseis';

CREATE OR REPLACE FUNCTION public.carrossel_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) = 3 AND caminho ~ '/[0-9]{2}\.png$' THEN
    NULL; -- página
  ELSIF array_length(partes, 1) = 4 AND partes[4] = 'assets' AND caminho ~ '/assets/[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp|ttf|otf)$' THEN
    NULL; -- fonte/ilustração do molde
  ELSE
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.carrosseis c
    WHERE c.cliente_id = partes[1]::uuid AND c.id = partes[2]::uuid AND c.token_envio = partes[3]::uuid
      AND c.status = 'produzindo');
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

NOTIFY pgrst, 'reload schema';
