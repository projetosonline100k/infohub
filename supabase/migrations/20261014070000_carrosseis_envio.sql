-- Envio das páginas do Roy pro Storage sem chave de servidor no Mac.
-- A cada versão o Roy (conexão de admin) sorteia um token_envio; o Storage
-- só aceita arquivo em carrosseis/<cliente>/<carrossel>/<token>/… enquanto
-- aquele carrossel está 'produzindo' e com aquele token. Quando vai pra
-- revisão, a porta fecha. O token não é legível pelo app.
ALTER TABLE public.carrosseis ADD COLUMN token_envio uuid;

REVOKE SELECT ON public.carrosseis FROM authenticated;
GRANT SELECT (id, cliente_id, user_id, estilo_id, atividade_id, numero, tema, fonte_id, fonte_permalink, fonte_data,
  fonte_legenda, status, mensagem, feedback, slides, legenda, paginas, pasta_drive, versao, revisado_em, criado_em,
  atualizado_em) ON public.carrosseis TO authenticated;

CREATE FUNCTION public.carrossel_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR caminho !~ '/[0-9]{2}\.png$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.carrosseis c
    WHERE c.cliente_id = partes[1]::uuid AND c.id = partes[2]::uuid AND c.token_envio = partes[3]::uuid
      AND c.status = 'produzindo');
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.carrossel_envio_permitido(text) FROM public;
GRANT EXECUTE ON FUNCTION public.carrossel_envio_permitido(text) TO anon, authenticated;

CREATE POLICY "Roy envia páginas do carrossel em produção"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'carrosseis' AND public.carrossel_envio_permitido(name));

NOTIFY pgrst, 'reload schema';
