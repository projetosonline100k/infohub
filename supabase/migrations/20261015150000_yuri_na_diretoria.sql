-- Pedido do Davi (15/10/2026): "Pôr o Yuri na Diretoria? pode pôr". O
-- especialista do projeto Yuri entra como pessoa na Diretoria da empresa do
-- projeto dele, antes do Davi, ligado ao login dele (conta_id), pra ver as
-- próprias tarefas em "Precisa de você".
INSERT INTO public.membros (cliente_id, setor_id, user_id, nome, funcao, responsabilidades, eh_ia, ativo, ordem, conta_id)
SELECT s.cliente_id, s.id, c.user_id, 'Yuri', 'Especialista (dono do projeto)',
       ARRAY['decisões do projeto', 'gravação dos conteúdos', 'aprovação da comunicação'], false, true, -1,
       (SELECT u.id FROM auth.users u WHERE lower(u.email) = 'copy.yuri1812@gmail.com')
  FROM public.setores s JOIN public.clientes c ON c.id = s.cliente_id
 WHERE s.cliente_id = 'f4cf4d62-e34c-412b-9c36-4cbed478186d' AND s.nome = 'Diretoria'
   AND NOT EXISTS (SELECT 1 FROM public.membros m WHERE m.cliente_id = s.cliente_id AND lower(m.nome) = 'yuri');
