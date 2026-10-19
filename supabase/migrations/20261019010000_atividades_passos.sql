-- Linha do tempo do que o funcionário (IA) já fez numa tarefa (19/10/2026, Davi: "ele já fez tudo isso
-- e eu nem sabia; quando eu clicar na atividade dele, quero ver o que já foi feito"). O ouvinte anota
-- sozinho cada passo do Claude (comando com a descrição, arquivo criado, pesquisa): [{"em", "texto", "tipo"}].
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS passos jsonb NOT NULL DEFAULT '[]'::jsonb;
