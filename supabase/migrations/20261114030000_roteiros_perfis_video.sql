-- Roteiro por perfil dentro do mesmo vídeo (14/11/2026, Davi: "dentro daqui tenham os perfis Instalivros / Insta_insights / Eu.davi / Jaci, em bolinhas; ao clicar o doc muda e fica zerado, e se voltar aparece o que estava escrito").
-- O perfil padrão (Instalivros) continua em `roteiro`; os outros ficam aqui: {"insta_insights": "<html>", "eu_davi": "<html>", "jaci": "<html>"}.
ALTER TABLE public.videos_vertical ADD COLUMN IF NOT EXISTS roteiros_perfis jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(roteiros_perfis) = 'object' AND pg_column_size(roteiros_perfis) < 2000000);
NOTIFY pgrst, 'reload schema';
