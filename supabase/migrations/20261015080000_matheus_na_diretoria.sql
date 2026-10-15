-- Pedido do Davi (15/10/2026): "Matheus tem que entrar na diretoria". O
-- especialista do projeto (Matheus Souto) entra como pessoa na Diretoria da
-- empresa do projeto dele, antes do Davi.
INSERT INTO public.membros (cliente_id, setor_id, user_id, nome, funcao, responsabilidades, eh_ia, ativo, ordem)
SELECT s.cliente_id, s.id, c.user_id, 'Matheus', 'Especialista (dono do projeto)',
       ARRAY['decisões do projeto', 'gravação dos conteúdos', 'aprovação da comunicação'], false, true, -1
  FROM public.setores s JOIN public.clientes c ON c.id = s.cliente_id
 WHERE s.cliente_id = 'c2373b17-98ef-4c0a-b0ad-6e57fef4ce98' AND s.nome = 'Diretoria'
   AND NOT EXISTS (SELECT 1 FROM public.membros m WHERE m.cliente_id = s.cliente_id AND lower(m.nome) = 'matheus');
