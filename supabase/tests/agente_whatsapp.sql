-- Regressão: o dono guarda a inteligência (uma por projeto) e pede ao Claude; pedido já nasce pendente e sem resposta; autor não se forja; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000371','ag-dono@example.com',now()), ('10000000-0000-0000-0000-000000000372','ag-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000371',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000373', 'AG', 30, 'x', '10000000-0000-0000-0000-000000000371');
SET LOCAL ROLE authenticated;
INSERT INTO public.agentes_whatsapp(cliente_id, config) VALUES ('10000000-0000-0000-0000-000000000373', '{"objetivo":"vender"}');
INSERT INTO public.agente_whatsapp_pedidos(cliente_id, tipo, mensagem, autor_id) VALUES ('10000000-0000-0000-0000-000000000373', 'construir', 'o produto é X', '10000000-0000-0000-0000-0000000000ff');
DO $$
BEGIN
  IF (SELECT autor_id FROM public.agente_whatsapp_pedidos) <> '10000000-0000-0000-0000-000000000371' THEN RAISE EXCEPTION 'autor forjado'; END IF;
  UPDATE public.agentes_whatsapp SET config = '{"objetivo":"agendar"}';
  IF (SELECT config->>'objetivo' FROM public.agentes_whatsapp) <> 'agendar' THEN RAISE EXCEPTION 'não atualizou'; END IF;
  BEGIN INSERT INTO public.agentes_whatsapp(cliente_id, config) VALUES ('10000000-0000-0000-0000-000000000373', '{}'); RAISE EXCEPTION 'duas inteligências no mesmo projeto';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public.agente_whatsapp_pedidos(cliente_id, tipo, mensagem, status, resposta) VALUES ('10000000-0000-0000-0000-000000000373', 'simular', 'oi', 'respondido', 'falsa'); RAISE EXCEPTION 'aceitou pedido já respondido';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.agente_whatsapp_pedidos SET status = 'respondido'; RAISE EXCEPTION 'dono respondeu o próprio pedido';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000372',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.agentes_whatsapp) + (SELECT count(*) FROM public.agente_whatsapp_pedidos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu'; END IF; END $$;
RESET ROLE;
ROLLBACK;
