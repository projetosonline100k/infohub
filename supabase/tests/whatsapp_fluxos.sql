-- Regressão: fluxos de mensagem no WhatsApp. O dono cria/edita fluxos; só inicia execução de fluxo ATIVO do mesmo projeto, para lead do mesmo projeto;
-- pausa/para mas não escreve o resto; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000491','wf-dono@example.com',now()), ('10000000-0000-0000-0000-000000000492','wf-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000491',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000493', 'Projeto WF', 30, 'x', '10000000-0000-0000-0000-000000000491'), ('10000000-0000-0000-0000-000000000494', 'Outro WF', 30, 'x', '10000000-0000-0000-0000-000000000491');
RESET ROLE;
INSERT INTO public.quizzes(id, cliente_id, user_id, titulo, slug) VALUES ('10000000-0000-0000-0000-000000000495', '10000000-0000-0000-0000-000000000493', '10000000-0000-0000-0000-000000000491', 'Quiz WF', 'quiz-wf-teste');
INSERT INTO public.quiz_respostas(id, quiz_id, cliente_id, user_id, respostas, nome, whatsapp) VALUES ('10000000-0000-0000-0000-000000000496', '10000000-0000-0000-0000-000000000495', '10000000-0000-0000-0000-000000000493', '10000000-0000-0000-0000-000000000491', '[]', 'Lead', '11999990000');
SET LOCAL ROLE authenticated;
INSERT INTO public.whatsapp_fluxos(id, cliente_id, nome, ativo) VALUES ('10000000-0000-0000-0000-000000000497', '10000000-0000-0000-0000-000000000493', 'Boas-vindas', true), ('10000000-0000-0000-0000-000000000498', '10000000-0000-0000-0000-000000000493', 'Desligado', false);
DO $$
BEGIN
  INSERT INTO public.whatsapp_fluxo_execucoes(fluxo_id, cliente_id, resposta_id) VALUES ('10000000-0000-0000-0000-000000000497', '10000000-0000-0000-0000-000000000493', '10000000-0000-0000-0000-000000000496');
  IF (SELECT estado FROM public.whatsapp_fluxo_execucoes) <> 'iniciar' THEN RAISE EXCEPTION 'não nasceu em iniciar'; END IF;
  BEGIN INSERT INTO public.whatsapp_fluxo_execucoes(fluxo_id, cliente_id, resposta_id) VALUES ('10000000-0000-0000-0000-000000000498', '10000000-0000-0000-0000-000000000493', '10000000-0000-0000-0000-000000000496');
    RAISE EXCEPTION 'iniciou fluxo desligado'; EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN INSERT INTO public.whatsapp_fluxo_execucoes(fluxo_id, cliente_id, resposta_id) VALUES ('10000000-0000-0000-0000-000000000497', '10000000-0000-0000-0000-000000000494', '10000000-0000-0000-0000-000000000496');
    RAISE EXCEPTION 'cruzou projetos'; EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  UPDATE public.whatsapp_fluxo_execucoes SET estado = 'pausado';
  UPDATE public.whatsapp_fluxo_execucoes SET estado = 'parado', motivo = 'Davi parou';
  BEGIN UPDATE public.whatsapp_fluxo_execucoes SET estado = 'fim'; RAISE EXCEPTION 'dono forjou fim'; EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN UPDATE public.whatsapp_fluxo_execucoes SET no_atual = 'x'; RAISE EXCEPTION 'dono mexeu no bloco'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.whatsapp_fluxos SET nome = 'Boas-vindas 2' WHERE id = '10000000-0000-0000-0000-000000000497';
  UPDATE public.whatsapp_fluxos SET gatilho = 'comprou', gatilho_espera_min = 30 WHERE id = '10000000-0000-0000-0000-000000000497';
  IF (SELECT ativado_em FROM public.whatsapp_fluxos WHERE id = '10000000-0000-0000-0000-000000000497') IS NULL THEN RAISE EXCEPTION 'ativado_em não foi carimbado'; END IF;
  BEGIN UPDATE public.whatsapp_fluxos SET gatilho = 'inventado'; RAISE EXCEPTION 'gatilho inventado'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.whatsapp_fluxos SET ativado_em = '2020-01-01'; RAISE EXCEPTION 'dono mexeu no ativado_em'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.whatsapp_fluxos SET disparos = 99; RAISE EXCEPTION 'dono mexeu nos disparos'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000492',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.whatsapp_fluxos) <> 0 OR (SELECT count(*) FROM public.whatsapp_fluxo_execucoes) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu fluxos'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
