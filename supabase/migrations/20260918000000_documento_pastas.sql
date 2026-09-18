-- Um documento pode aparecer em mais de uma pasta ao mesmo tempo, além da
-- pasta "principal" (documentos.pasta_id, usada pelas guias/abas dentro do
-- editor). Essa tabela guarda só os vínculos extras: "também mostrar este
-- documento nesta outra pasta", sem tirar ele de onde já estava.
BEGIN;

CREATE TABLE public.documento_pastas (
  documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
  pasta_id uuid NOT NULL REFERENCES public.pastas_atividade(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (documento_id, pasta_id)
);

ALTER TABLE public.documento_pastas ENABLE ROW LEVEL SECURITY;

-- Reaproveita exatamente a mesma checagem de permissão por equipe já usada
-- na tabela documentos (área "documentos"): leitura pede "acessar", criar
-- ou apagar um vínculo pede "editar" (é uma alteração no documento).
CREATE POLICY "documento_pastas_select" ON public.documento_pastas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id = documento_pastas.documento_id
      AND public.team_row_allowed('documentos', to_jsonb(d), 'documentos', 'acessar')
  ));

CREATE POLICY "documento_pastas_insert" ON public.documento_pastas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id = documento_pastas.documento_id
      AND public.team_row_allowed('documentos', to_jsonb(d), 'documentos', 'editar')
  ));

CREATE POLICY "documento_pastas_delete" ON public.documento_pastas
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id = documento_pastas.documento_id
      AND public.team_row_allowed('documentos', to_jsonb(d), 'documentos', 'editar')
  ));

NOTIFY pgrst, 'reload schema';
COMMIT;
