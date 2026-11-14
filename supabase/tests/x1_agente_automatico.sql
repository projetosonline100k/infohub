-- Regressão: agente automático do X1. O dono começa a conversa (só em 'abordar'), pausa e retoma, mas não escreve o resto;
-- uma conversa por lead; lead de outro projeto não entra; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000471','x1-dono@example.com',now()), ('10000000-0000-0000-0000-000000000472','x1-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000471',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000473', 'Projeto X1', 30, 'x', '10000000-0000-0000-0000-000000000471'), ('10000000-0000-0000-0000-000000000474', 'Outro projeto', 30, 'x', '10000000-0000-0000-0000-000000000471');
RESET ROLE;
INSERT INTO public.quizzes(id, cliente_id, user_id, titulo, slug) VALUES ('10000000-0000-0000-0000-000000000475', '10000000-0000-0000-0000-000000000473', '10000000-0000-0000-0000-000000000471', 'Quiz X1', 'x1-teste-471');
INSERT INTO public.quiz_respostas(id, quiz_id, cliente_id, user_id, respostas, nome, whatsapp) VALUES ('10000000-0000-0000-0000-000000000476', '10000000-0000-0000-0000-000000000475', '10000000-0000-0000-0000-000000000473', '10000000-0000-0000-0000-000000000471', '[]', 'Lead', '+5511999990000');
SET LOCAL ROLE authenticated;
INSERT INTO public.x1_agente_conversas(quiz_id, resposta_id, cliente_id) VALUES ('10000000-0000-0000-0000-000000000475', '10000000-0000-0000-0000-000000000476', '10000000-0000-0000-0000-000000000473');
DO $$
BEGIN
  IF (SELECT estado FROM public.x1_agente_conversas) <> 'abordar' THEN RAISE EXCEPTION 'não nasceu em abordar'; END IF;
  BEGIN INSERT INTO public.x1_agente_conversas(quiz_id, resposta_id, cliente_id) VALUES ('10000000-0000-0000-0000-000000000475', '10000000-0000-0000-0000-000000000476', '10000000-0000-0000-0000-000000000473'); RAISE EXCEPTION 'duas conversas do mesmo lead';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public.x1_agente_conversas(quiz_id, resposta_id, cliente_id, estado) VALUES ('10000000-0000-0000-0000-000000000475', '10000000-0000-0000-0000-000000000476', '10000000-0000-0000-0000-000000000474', 'conversando'); RAISE EXCEPTION 'estado forjado';
  EXCEPTION WHEN insufficient_privilege OR unique_violation OR check_violation THEN NULL; END;
  UPDATE public.x1_agente_conversas SET estado = 'pausado', motivo = 'Davi pausou';
  UPDATE public.x1_agente_conversas SET estado = 'conversando';
  BEGIN UPDATE public.x1_agente_conversas SET enviadas = 99; RAISE EXCEPTION 'dono mexeu nos contadores';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.x1_agente_conversas SET estado = 'aguardando_humano'; RAISE EXCEPTION 'dono forjou aguardando_humano';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  IF (SELECT cursor_em FROM public.x1_agente_conversas) IS NULL THEN RAISE EXCEPTION 'retomar deveria zerar o cursor para agora'; END IF;
  UPDATE public.x1_agente_conversas SET estado = 'abordar', motivo = '__recomecar__';
  IF (SELECT recomecou_em IS NULL OR motivo IS NOT NULL OR enviadas <> 0 OR estado <> 'abordar' FROM public.x1_agente_conversas) THEN RAISE EXCEPTION 'recomeçar não zerou a conversa'; END IF;
  BEGIN INSERT INTO public.x1_agente_propostas(conversa_id, resposta_id, cliente_id, tipo, mensagens) SELECT id, resposta_id, cliente_id, 'abertura', '{oi}' FROM public.x1_agente_conversas; RAISE EXCEPTION 'dono criou proposta';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.x1_agente_raciocinio(conversa_id, resposta_id, cliente_id, raciocinio) SELECT id, resposta_id, cliente_id, 'x' FROM public.x1_agente_conversas; RAISE EXCEPTION 'dono escreveu raciocínio';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.x1_agente_propostas(conversa_id, resposta_id, cliente_id, tipo, mensagens) SELECT id, resposta_id, cliente_id, 'abertura', '{oi}' FROM public.x1_agente_conversas;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000471',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.x1_agente_propostas) <> 1 THEN RAISE EXCEPTION 'dono não vê a proposta'; END IF;
  UPDATE public.x1_agente_propostas SET mensagens = '{oi, tudo bem?}';
  BEGIN UPDATE public.x1_agente_propostas SET status = 'enviada'; RAISE EXCEPTION 'dono marcou enviada';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  UPDATE public.x1_agente_propostas SET instrucao = 'mais curto', status = 'revisando';
  IF (SELECT status FROM public.x1_agente_propostas) <> 'revisando' THEN RAISE EXCEPTION 'pedido de ajuste não gravou'; END IF;
  UPDATE public.x1_agente_propostas SET status = 'aprovada';   -- já não é pendente: não pode mexer (0 linhas)
  IF (SELECT status FROM public.x1_agente_propostas) <> 'revisando' THEN RAISE EXCEPTION 'dono mexeu em proposta que não é pendente'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000472',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.x1_agente_conversas) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu a conversa'; END IF;
  BEGIN INSERT INTO public.x1_agente_conversas(quiz_id, resposta_id, cliente_id) VALUES ('10000000-0000-0000-0000-000000000475', '10000000-0000-0000-0000-000000000476', '10000000-0000-0000-0000-000000000473'); RAISE EXCEPTION 'outra pessoa começou a conversa';
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
