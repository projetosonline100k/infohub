-- Tipo do documento calculado no banco a partir do prefixo de `conteudo`
-- (mesma convenção de CadernoEditor, MindMapEditor e useAssistantDocumentos).
-- Assim a lista de Projetos conta notas e a aba Documentos monta a lista
-- sem baixar o conteúdo inteiro de todos os documentos.
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS tipo text GENERATED ALWAYS AS (
    CASE
      WHEN starts_with(coalesce(conteudo, ''), '__NOTA_RAPIDA_V1__')
        OR starts_with(coalesce(conteudo, ''), '<p>__NOTA_RAPIDA_V1__</p>') THEN 'nota'
      WHEN starts_with(coalesce(conteudo, ''), '__CANVASMENTAL_V1__') THEN 'mapa'
      WHEN starts_with(coalesce(conteudo, ''), '__CADERNO_V1__') THEN 'caderno'
      ELSE 'documento'
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS documentos_cliente_tipo_idx
  ON public.documentos (cliente_id, tipo) WHERE deleted_at IS NULL;
