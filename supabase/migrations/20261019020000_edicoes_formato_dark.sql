-- Formato 'dark' do Danilo (19/10/2026): o Davi não aparece, só a voz; a tela
-- inteira é o papel desenhado à mão (scripts/danilo/dark.py). Abre no editor
-- como as outras edições; os ajustes são pela conversa com o Danilo.
ALTER TABLE public.edicoes_video DROP CONSTRAINT IF EXISTS edicoes_video_formato_check;
ALTER TABLE public.edicoes_video ADD CONSTRAINT edicoes_video_formato_check CHECK (formato IN ('classico', 'papel', 'dark'));
NOTIFY pgrst, 'reload schema';
