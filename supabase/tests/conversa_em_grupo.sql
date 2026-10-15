-- Regressão: conversa em grupo. O Davi chama outro funcionário do mesmo
-- projeto; de outro projeto é recusado; o dono não entra duplicado; o app
-- continua sem conseguir falar como funcionário.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000491','grupo-dono-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000491',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000492', 'Grupo A', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000493', 'Grupo B', 30, 'x', auth.uid());
INSERT INTO public.membros(id, cliente_id, nome, eh_ia) VALUES
 ('10000000-0000-0000-0000-000000000494', '10000000-0000-0000-0000-000000000492', 'Roy', true),
 ('10000000-0000-0000-0000-000000000495', '10000000-0000-0000-0000-000000000492', 'Ítalo', true),
 ('10000000-0000-0000-0000-000000000496', '10000000-0000-0000-0000-000000000493', 'Ítalo', true);
INSERT INTO public.briefings(id, cliente_id, membro_id) VALUES
 ('10000000-0000-0000-0000-000000000497', '10000000-0000-0000-0000-000000000492', '10000000-0000-0000-0000-000000000494');

UPDATE public.briefings SET participantes = ARRAY['10000000-0000-0000-0000-000000000495', '10000000-0000-0000-0000-000000000494', '10000000-0000-0000-0000-000000000495']::uuid[]
 WHERE id = '10000000-0000-0000-0000-000000000497';
DO $$
BEGIN
  IF (SELECT participantes FROM public.briefings WHERE id = '10000000-0000-0000-0000-000000000497') <> ARRAY['10000000-0000-0000-0000-000000000495']::uuid[] THEN
    RAISE EXCEPTION 'participantes não ficaram só com o Ítalo'; END IF;
END $$;

DO $$
BEGIN
  UPDATE public.briefings SET participantes = ARRAY['10000000-0000-0000-0000-000000000496']::uuid[] WHERE id = '10000000-0000-0000-0000-000000000497';
  RAISE EXCEPTION 'aceitou participante de outro projeto';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'participante não é deste projeto' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.briefing_mensagens(briefing_id, cliente_id, papel, texto, membro_id) VALUES
   ('10000000-0000-0000-0000-000000000497', '10000000-0000-0000-0000-000000000492', 'funcionario', 'oi', '10000000-0000-0000-0000-000000000495');
  RAISE EXCEPTION 'app falou como funcionário';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
ROLLBACK;
