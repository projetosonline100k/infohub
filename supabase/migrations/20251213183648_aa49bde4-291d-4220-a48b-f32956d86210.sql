-- Adicionar campos de link e plataforma nos perfis parecidos
ALTER TABLE public.perfis_parecidos 
ADD COLUMN link_perfil TEXT,
ADD COLUMN plataforma TEXT DEFAULT 'conteudo_curto';