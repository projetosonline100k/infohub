-- Um documento pode fazer parte de uma pasta (a mesma usada pelas
-- atividades), pra reunir tarefas e documentos do mesmo projeto num só
-- lugar. Ao apagar a pasta, o documento não some, só perde o vínculo.
BEGIN;
ALTER TABLE public.documentos
  ADD COLUMN pasta_id uuid REFERENCES public.pastas_atividade(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
