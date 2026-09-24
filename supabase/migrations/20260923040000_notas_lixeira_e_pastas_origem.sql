-- Item 2 (rodada 3): lixeira de notas + pastas próprias de notas.
--
-- documentos.deleted_at: soft-delete — mesma convenção já usada em
-- atividades.deleted_at/pastas_atividade.deleted_at. Sem auto-purge (fica
-- na lixeira até o usuário excluir de vez ou restaurar).
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- pastas_atividade.origem já existe (migração 20260921000000) exatamente
-- pra separar listas de pastas por feature sobre a mesma tabela
-- ('atividades' vs 'documentos'). Amplia pra um terceiro valor 'notas',
-- mantendo pastas de notas isoladas das de Atividades/Documentos sem
-- duplicar a tabela.
ALTER TABLE public.pastas_atividade DROP CONSTRAINT IF EXISTS pastas_atividade_origem_check;
ALTER TABLE public.pastas_atividade ADD CONSTRAINT pastas_atividade_origem_check
  CHECK (origem IN ('atividades', 'documentos', 'notas'));
