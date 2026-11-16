-- "Não achei o reel desta tarefa" ao clicar num reel programado (16/11/2026, Davi): a migração da capa do reel (20261028010000) criou capa_ms, capa_sugestoes
-- e capa_pelo_davi, mas a tabela reels só dá SELECT por coluna ao app e esqueceu essas três. A tela "Quando publicar o reel?" (ProgramarReel) lê as três, o
-- select inteiro falhava com "permission denied" e a tela dizia que o reel não existia, então ninguém conseguia mudar dia, hora, legenda ou capa de um reel.
GRANT SELECT (capa_ms, capa_sugestoes, capa_pelo_davi) ON public.reels TO authenticated;
NOTIFY pgrst, 'reload schema';
