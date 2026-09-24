-- "Fixar nota" (item 9 do refinamento) — reaproveita a tabela documentos já
-- usada pelas notas do Jarvis (conteúdo prefixado com __NOTA_RAPIDA_V1__,
-- ver useAssistantDocumentos.ts), só uma coluna nova.
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS fixado boolean NOT NULL DEFAULT false;
