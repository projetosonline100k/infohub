-- Regressão: briefing de tarefa. O Davi conversa com o funcionário do
-- projeto; a mensagem dele entra 'enviada'; o app não escreve como
-- funcionário nem a proposta; outra pessoa não vê; funcionário de outro
-- projeto é recusado.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000181','brief-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000182','brief-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000181',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000183', 'Brief A', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000184', 'Brief B', 30, 'x', auth.uid());
INSERT INTO public.membros(id, cliente_id, nome, eh_ia) VALUES
 ('10000000-0000-0000-0000-000000000185', '10000000-0000-0000-0000-000000000183', 'Ítalo', true),
 ('10000000-0000-0000-0000-000000000186', '10000000-0000-0000-0000-000000000184', 'Ítalo', true);
INSERT INTO public.briefings(id, cliente_id, membro_id) VALUES
 ('10000000-0000-0000-0000-000000000187', '10000000-0000-0000-0000-000000000183', '10000000-0000-0000-0000-000000000185');
INSERT INTO public.briefing_mensagens(briefing_id, cliente_id, papel, texto) VALUES
 ('10000000-0000-0000-0000-000000000187', '10000000-0000-0000-0000-000000000183', 'davi', 'Mapeie os quizzes que funcionam');

DO $$
BEGIN
  IF (SELECT status FROM public.briefing_mensagens WHERE briefing_id = '10000000-0000-0000-0000-000000000187') <> 'enviada' THEN
    RAISE EXCEPTION 'mensagem do Davi não entrou como enviada'; END IF;
  IF (SELECT user_id FROM public.briefings WHERE id = '10000000-0000-0000-0000-000000000187') <> auth.uid() THEN
    RAISE EXCEPTION 'dono não carimbado'; END IF;
END $$;

-- O app não fala pelo funcionário.
DO $$
BEGIN
  INSERT INTO public.briefing_mensagens(briefing_id, cliente_id, papel, texto)
  VALUES ('10000000-0000-0000-0000-000000000187', '10000000-0000-0000-0000-000000000183', 'funcionario', 'Entendi');
  RAISE EXCEPTION 'app escreveu como funcionário';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- O app não grava a proposta.
DO $$
BEGIN
  UPDATE public.briefings SET proposta = '{"titulo":"x"}' WHERE id = '10000000-0000-0000-0000-000000000187';
  RAISE EXCEPTION 'app gravou a proposta';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- Funcionário de outro projeto é recusado.
DO $$
BEGIN
  INSERT INTO public.briefings(cliente_id, membro_id)
  VALUES ('10000000-0000-0000-0000-000000000183', '10000000-0000-0000-0000-000000000186');
  RAISE EXCEPTION 'aceitou funcionário de outro projeto';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'funcionário não é deste projeto' THEN RAISE; END IF;
END $$;

-- Confirmar: o app muda o status.
UPDATE public.briefings SET status = 'confirmado' WHERE id = '10000000-0000-0000-0000-000000000187';

-- Outra pessoa não vê nada.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000182',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.briefings) OR EXISTS (SELECT 1 FROM public.briefing_mensagens) THEN
    RAISE EXCEPTION 'alheio viu o briefing'; END IF;
END $$;
RESET ROLE;

-- O ouvinte (admin) responde como funcionário e grava a proposta.
INSERT INTO public.briefing_mensagens(briefing_id, papel, texto)
 VALUES ('10000000-0000-0000-0000-000000000187', 'funcionario', 'Entendi: vou mapear os quizzes.');
UPDATE public.briefings SET proposta = '{"titulo":"Mapa de quizzes","consigo":"sim"}' WHERE id = '10000000-0000-0000-0000-000000000187';
DO $$
BEGIN
  IF (SELECT cliente_id FROM public.briefing_mensagens WHERE papel = 'funcionario' AND briefing_id = '10000000-0000-0000-0000-000000000187')
     <> '10000000-0000-0000-0000-000000000183' THEN RAISE EXCEPTION 'mensagem não herdou o projeto'; END IF;
  IF (SELECT status FROM public.briefing_mensagens WHERE papel = 'funcionario' AND briefing_id = '10000000-0000-0000-0000-000000000187') IS NOT NULL THEN
    RAISE EXCEPTION 'mensagem do funcionário com status'; END IF;
END $$;
ROLLBACK;
