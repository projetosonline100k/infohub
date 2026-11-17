-- Kdu também no Marketing do escritório do Instalivros (17/11/2026: o Davi abriu o Marketing do Instalivros e não achou o Kdu, que tinha entrado só no escritório do Davi).
INSERT INTO public.membros (id, cliente_id, setor_id, user_id, nome, funcao, responsabilidades, eh_ia, autonomo, ativo, ordem)
SELECT gen_random_uuid(), c.id, 'bdeff03e-0efb-447e-a10c-767029e0c7a2', c.user_id, 'Kdu', 'Gestor de tráfego · Facebook Ads (IA)',
       ARRAY['gerenciador de anúncios do Facebook Ads', 'acompanhar gasto, resultados, custo por resultado e retorno das campanhas', 'avisar o que está gastando sem dar resultado e o que merece mais verba', 'sugerir testes de criativo e público (o Davi decide)'],
       true, true, true, 14
  FROM public.clientes c
 WHERE c.id = 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3'
   AND NOT EXISTS (SELECT 1 FROM public.membros m WHERE m.cliente_id = c.id AND lower(m.nome) = 'kdu');
