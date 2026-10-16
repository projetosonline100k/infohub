-- Regressão: ao entrar em andamento a tarefa marca `andamento_desde`; ao sair,
-- a previsão de fim é limpa.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000591','prev-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000591',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000592', 'Prev', 30, 'x', auth.uid());
INSERT INTO public.atividades(id, cliente_id, titulo, user_id, situacao) VALUES ('10000000-0000-0000-0000-000000000593', '10000000-0000-0000-0000-000000000592', 'T', auth.uid(), 'fila');
DO $$
BEGIN
  IF (SELECT andamento_desde FROM public.atividades WHERE id = '10000000-0000-0000-0000-000000000593') IS NOT NULL THEN RAISE EXCEPTION 'fila marcou andamento'; END IF;
END $$;
UPDATE public.atividades SET situacao = 'andamento' WHERE id = '10000000-0000-0000-0000-000000000593';
UPDATE public.atividades SET previsao_fim = now() + interval '10 minutes' WHERE id = '10000000-0000-0000-0000-000000000593';
DO $$
BEGIN
  IF (SELECT andamento_desde FROM public.atividades WHERE id = '10000000-0000-0000-0000-000000000593') IS NULL THEN RAISE EXCEPTION 'andamento sem andamento_desde'; END IF;
  IF (SELECT previsao_fim FROM public.atividades WHERE id = '10000000-0000-0000-0000-000000000593') IS NULL THEN RAISE EXCEPTION 'previsão não ficou'; END IF;
END $$;
UPDATE public.atividades SET situacao = 'aguardando_aprovacao' WHERE id = '10000000-0000-0000-0000-000000000593';
DO $$
BEGIN
  IF (SELECT previsao_fim FROM public.atividades WHERE id = '10000000-0000-0000-0000-000000000593') IS NOT NULL THEN RAISE EXCEPTION 'previsão não limpou ao sair de andamento'; END IF;
END $$;
ROLLBACK;
