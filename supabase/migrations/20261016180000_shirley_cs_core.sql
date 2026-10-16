-- Pedido do Davi (16/10/2026): "implementar um funcionário na Core do sucesso do
-- cliente, que vai ser o CS… eu clico nele e aparece o WhatsApp" — mesmo fluxo do
-- WhatsApp do Atlas (sugestões em sanduíche + DISC, saúde dos clientes, conversas).
-- A Shirley é IA e trabalha sozinha (tarefas dela começam sozinhas); NUNCA envia
-- mensagem sem o ok do Davi. Manual: docs/agentes/shirley-cs.md.
INSERT INTO public.membros (cliente_id, setor_id, user_id, nome, funcao, responsabilidades, eh_ia, autonomo, ativo, ordem, manual)
SELECT s.cliente_id, s.id, c.user_id, 'Shirley', 'Sucesso do cliente · CS (IA)',
       ARRAY['responder clientes no WhatsApp (com o ok do Davi)', 'saúde dos clientes', 'boas-vindas, check-ins e renovação'],
       true, true, true, 10,
       'Leia docs/agentes/shirley-cs.md antes de cada conversa e de cada tarefa.'
  FROM public.setores s JOIN public.clientes c ON c.id = s.cliente_id
 WHERE s.id = 'fe62e9fe-0b6f-4ae0-b733-b8be7cc5a95a'
   AND NOT EXISTS (SELECT 1 FROM public.membros m WHERE m.cliente_id = s.cliente_id AND lower(m.nome) = 'shirley');
