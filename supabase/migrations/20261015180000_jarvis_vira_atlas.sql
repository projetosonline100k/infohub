-- Pedido do Davi (15/10/2026): "O nome do Jarvis será Atlas". Renomeia o
-- coordenador (IA) da empresa em todos os projetos. As tabelas e rotas
-- internas (jarvis_*, /jarvis) continuam com o nome técnico antigo.
UPDATE public.membros SET nome = 'Atlas' WHERE eh_ia AND nome = 'Jarvis';
