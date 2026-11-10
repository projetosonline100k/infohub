-- O app precisa poder ligar/desligar o modo vivo (a tabela só libera colunas específicas para o app).
-- Quem pode ligar é conferido pelo gatilho briefing_modo_vivo_so_davi.
GRANT UPDATE (modo_vivo) ON public.briefings TO authenticated;
NOTIFY pgrst, 'reload schema';
