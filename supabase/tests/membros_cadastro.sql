-- Regressão: o dono cria um funcionário com função, manual, aparência e
-- "trabalha sozinho"; outra conta não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000991','mc-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000992','mc-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000991',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000993', 'MC', 30, 'x', auth.uid());
INSERT INTO public.setores(id, cliente_id, nome, cor, ordem) VALUES ('10000000-0000-0000-0000-000000000994', '10000000-0000-0000-0000-000000000993', 'Vendas', 'blue', 1);
INSERT INTO public.membros(id, cliente_id, setor_id, nome, funcao, responsabilidades, eh_ia, autonomo, manual, visual, ordem) VALUES
 ('10000000-0000-0000-0000-000000000995', '10000000-0000-0000-0000-000000000993', '10000000-0000-0000-0000-000000000994',
  'Lia', 'SDR (IA)', ARRAY['qualificar leads'], true, true, 'Você qualifica leads…', '{"pele":"#e0ac7e","cabelo":"longo","corCabelo":"#2b2b2b","camisa":"#0ea5e9"}', 5);
DO $$
BEGIN
  IF NOT (SELECT autonomo FROM public.membros WHERE id = '10000000-0000-0000-0000-000000000995') THEN RAISE EXCEPTION 'autonomo não gravou'; END IF;
  IF (SELECT visual->>'cabelo' FROM public.membros WHERE id = '10000000-0000-0000-0000-000000000995') <> 'longo' THEN RAISE EXCEPTION 'visual não gravou'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000992',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.membros WHERE id = '10000000-0000-0000-0000-000000000995') THEN RAISE EXCEPTION 'outra conta viu o funcionário'; END IF;
END $$;
ROLLBACK;
