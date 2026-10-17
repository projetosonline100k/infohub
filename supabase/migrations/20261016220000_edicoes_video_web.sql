-- Editor do Danilo também pela web: o Mac do Davi continua sendo a fábrica
-- (render), mas o projeto da edição, a prévia e os pedidos ficam na nuvem.
--  1. edicoes_video.projeto: cópia do projeto.json (cortes, legendas, zoom,
--     imagens, música), gravada pelo Mac a cada versão. previa_url/ondas_url:
--     prévia leve e forma de onda no bucket `edicoes`, para assistir no navegador.
--  2. edicoes_pedidos: "Gerar versão" (com o projeto mexido) ou "Aprovar" feitos
--     no navegador. O serviço do Danilo no Mac pega, renderiza e sobe de volta.
--  3. Bucket público `edicoes`: <cliente>/<edicao>/<token>/<arquivo>; só sobe
--     quem tem o token da edição (o Mac não tem chave de servidor).

ALTER TABLE public.edicoes_video
  ADD COLUMN projeto jsonb,
  ADD COLUMN projeto_em timestamptz,
  ADD COLUMN previa_url text,
  ADD COLUMN ondas_url text,
  ADD COLUMN token_envio uuid NOT NULL DEFAULT gen_random_uuid();
-- O token só serve para o Mac subir arquivos: o app não lê.
REVOKE SELECT ON public.edicoes_video FROM authenticated;
GRANT SELECT (id, cliente_id, user_id, video_vertical_id, atividade_id, titulo, status, mensagem, bruto_drive,
              final_drive, duracao, versao, criado_em, atualizado_em, projeto, projeto_em, previa_url, ondas_url)
  ON public.edicoes_video TO authenticated;

CREATE TABLE public.edicoes_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicao_id uuid NOT NULL REFERENCES public.edicoes_video(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('versao', 'aprovar')),
  projeto jsonb,                  -- 'versao': o projeto inteiro como ficou no navegador
  status text NOT NULL DEFAULT 'na_fila' CHECK (status IN ('na_fila', 'fazendo', 'feito', 'erro')),
  mensagem text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo = 'aprovar' OR projeto IS NOT NULL)
);
CREATE INDEX edicoes_pedidos_fila_idx ON public.edicoes_pedidos (status, criado_em);

-- O projeto do pedido vem da edição: não dá para apontar para cliente alheio.
CREATE FUNCTION public.edicao_pedido_preenche()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT e.cliente_id INTO NEW.cliente_id FROM public.edicoes_video e WHERE e.id = NEW.edicao_id;
  IF NEW.cliente_id IS NULL THEN RAISE EXCEPTION 'edição não encontrada'; END IF;
  NEW.status := 'na_fila';
  NEW.mensagem := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER edicao_pedido_preenche BEFORE INSERT ON public.edicoes_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.edicao_pedido_preenche();

ALTER TABLE public.edicoes_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edicoes_pedidos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.edicoes_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.edicoes_pedidos FOR SELECT TO authenticated
  USING (public.team_row_allowed('edicoes_pedidos', to_jsonb(edicoes_pedidos.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_criar ON public.edicoes_pedidos FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('edicoes_pedidos', to_jsonb(edicoes_pedidos.*), 'atividades', 'editar'));
-- O app só pede; quem anda com o pedido é o serviço do Danilo (admin).
GRANT SELECT, INSERT (edicao_id, tipo, projeto) ON public.edicoes_pedidos TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.edicoes_pedidos;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('edicoes', 'edicoes', true, 52428800, ARRAY['video/mp4', 'application/json'])
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.edicao_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3
     OR caminho !~ '/(previa-v[0-9]+\.mp4|ondas-v[0-9]+\.json)$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.edicoes_video e
    WHERE e.cliente_id = partes[1]::uuid AND e.id = partes[2]::uuid AND e.token_envio = partes[3]::uuid);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.edicao_envio_permitido(text) FROM public;
GRANT EXECUTE ON FUNCTION public.edicao_envio_permitido(text) TO anon, authenticated;

CREATE POLICY "Prévias das edições são públicas para leitura" ON storage.objects FOR SELECT USING (bucket_id = 'edicoes');
CREATE POLICY "Danilo envia a prévia da edição" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'edicoes' AND public.edicao_envio_permitido(name));

NOTIFY pgrst, 'reload schema';
