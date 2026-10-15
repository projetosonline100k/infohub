-- Pedido do Davi (15/10/2026), projeto Davi Queiroz:
-- * Gabriel vira IA de estudos e pesquisas: traz estudos para o Davi se manter
--   atualizado (e pesquisas pontuais na internet). Trabalha sozinho e o
--   resultado aparece em Conteúdo → Fonte de conhecimento.
-- * Roy assume o que era do Gabriel: além dos carrosséis, páginas e quizzes.
UPDATE public.membros SET eh_ia = true, funcao = 'Estudos e pesquisas (IA)',
  responsabilidades = ARRAY['estudos para o Davi se manter atualizado', 'pesquisas pontuais na internet', 'resumos de livros, cursos e tendências', 'fonte de conhecimento em formato de newsletter']
WHERE id = '09d6ab1e-f147-43d3-9dbe-d325148ddca6';
UPDATE public.membros SET funcao = 'Carrosséis, páginas e quizzes (IA)',
  responsabilidades = ARRAY['criação de carrosséis', 'páginas de vendas e landing pages', 'quizzes', 'peças visuais, thumbnails e capas']
WHERE id = 'd48518b9-22b9-49c1-98e2-259c101ed2a0';
