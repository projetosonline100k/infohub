-- Esteira (17/10/2026, Davi): "quando passar para o Junior, quero clicar e abrir um docs
-- normal, como a gente já estava acostumado". A peça ganha um documento do projeto
-- (nasce quando chega no Roteiro; o Junior escreve nele e a Revisão do Elias entra no fim).
ALTER TABLE public.esteira_itens ADD COLUMN IF NOT EXISTS documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
