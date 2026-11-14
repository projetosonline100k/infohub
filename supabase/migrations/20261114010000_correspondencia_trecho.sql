-- Terceiro modo de palavra-chave (14/11/2026, Davi: "as pessoas escrevem errado; se eu colocasse 'insta', só esse trecho já seria suficiente para ativar a automação"):
-- 'trecho' = o comentário só precisa CONTER o pedaço escrito (insta → instalivros, instalivro, instalivors, insta livros).
ALTER TABLE public.instagram_automacoes DROP CONSTRAINT instagram_automacoes_correspondencia_check;
ALTER TABLE public.instagram_automacoes ADD CONSTRAINT instagram_automacoes_correspondencia_check CHECK (correspondencia IN ('contem', 'exata', 'trecho'));
ALTER TABLE public.instagram_fluxos DROP CONSTRAINT instagram_fluxos_correspondencia_check;
ALTER TABLE public.instagram_fluxos ADD CONSTRAINT instagram_fluxos_correspondencia_check CHECK (correspondencia IN ('contem', 'exata', 'trecho'));
