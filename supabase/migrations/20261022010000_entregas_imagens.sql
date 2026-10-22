-- Imagens nas entregas dos funcionários (22/10, Davi: "sou bem visual"; o Roy entregou um carrossel só em
-- texto porque não tinha onde guardar os PNGs). Bucket público 'entregas': o Mac sobe com a chave pública,
-- só no caminho <atividade>/<token>/<arquivo>, com um token sorteado na hora (vale 3 horas).
INSERT INTO storage.buckets (id, name, public) VALUES ('entregas', 'entregas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE TABLE IF NOT EXISTS public.entregas_envio (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entregas_envio ENABLE ROW LEVEL SECURITY;   -- sem policy: só o Mac (admin) sorteia

CREATE OR REPLACE FUNCTION public.entrega_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 2 OR caminho !~* '\.(png|jpe?g|webp|gif|mp4)$' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.entregas_envio e
                  WHERE e.atividade_id = partes[1]::uuid AND e.token = partes[2]::uuid
                    AND e.criado_em > now() - interval '3 hours');
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END $$;

DROP POLICY IF EXISTS "Entregas: Mac envia com token" ON storage.objects;
CREATE POLICY "Entregas: Mac envia com token" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'entregas' AND public.entrega_envio_permitido(name));
DROP POLICY IF EXISTS "Entregas são públicas para leitura" ON storage.objects;
CREATE POLICY "Entregas são públicas para leitura" ON storage.objects FOR SELECT
  USING (bucket_id = 'entregas');
