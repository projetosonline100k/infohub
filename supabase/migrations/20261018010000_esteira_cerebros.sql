-- Cérebro da esteira (18/10/2026, Davi): "quero cadastrar cliente — Davi, informações
-- importantes, apresentação, narrativa e outras coisas que eu quiser ir colocando; vai ser
-- o cérebro onde o Junior e o Elias vão se basear na hora de criar os roteiros".
-- Cada escritório com esteira guarda os cérebros: [{id, nome, secoes: [{titulo, texto}]}].
-- A peça escolhe para quem é (textos._para = id do cérebro; sem isso, o primeiro).
ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS cerebros jsonb NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';
