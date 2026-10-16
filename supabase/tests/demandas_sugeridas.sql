-- Regressão: guia "Passar demanda" do Pedro. O dono vê, passa, adia, descarta e
-- apaga; não cria nem reescreve a sugestão; abrir o cartão não mexe em
-- atualizado_em; outra conta não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000891','pd-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000892','pd-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000891',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000893', 'PD', 30, 'x', auth.uid());
INSERT INTO public.membros(id, cliente_id, nome, eh_ia) VALUES ('10000000-0000-0000-0000-000000000894', '10000000-0000-0000-0000-000000000893', 'Ítalo', true);

-- O Pedro (admin) sugere: o dono fica carimbado e o cartão nasce NOVO.
RESET ROLE;
INSERT INTO public.demandas_sugeridas(id, cliente_id, membro_id, titulo, porque, prazo_sugerido) VALUES
 ('10000000-0000-0000-0000-000000000895', '10000000-0000-0000-0000-000000000893', '10000000-0000-0000-0000-000000000894',
  'Escrever 3 anúncios do Core', 'Ítalo está sem tarefa e o Core é o produto ativo', '2026-10-18');
UPDATE public.demandas_sugeridas SET atualizado_em = '2026-01-01' WHERE id = '10000000-0000-0000-0000-000000000895';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT user_id FROM public.demandas_sugeridas WHERE id = '10000000-0000-0000-0000-000000000895') <> '10000000-0000-0000-0000-000000000891' THEN RAISE EXCEPTION 'sem dono'; END IF;
  IF (SELECT visto_em FROM public.demandas_sugeridas WHERE id = '10000000-0000-0000-0000-000000000895') IS NOT NULL THEN RAISE EXCEPTION 'nasceu vista'; END IF;
END $$;
UPDATE public.demandas_sugeridas SET visto_em = now() WHERE id = '10000000-0000-0000-0000-000000000895';
DO $$
BEGIN
  IF (SELECT atualizado_em FROM public.demandas_sugeridas WHERE id = '10000000-0000-0000-0000-000000000895') <> '2026-01-01' THEN RAISE EXCEPTION 'abrir o cartão mudou atualizado_em'; END IF;
END $$;

-- Passar = abre a conversa com o funcionário e liga o cartão a ela.
INSERT INTO public.briefings(id, cliente_id, membro_id) VALUES
 ('10000000-0000-0000-0000-000000000896', '10000000-0000-0000-0000-000000000893', '10000000-0000-0000-0000-000000000894');
UPDATE public.demandas_sugeridas SET status = 'passada', briefing_id = '10000000-0000-0000-0000-000000000896' WHERE id = '10000000-0000-0000-0000-000000000895';
UPDATE public.demandas_sugeridas SET status = 'adiada' WHERE id = '10000000-0000-0000-0000-000000000895';
UPDATE public.demandas_sugeridas SET status = 'descartada' WHERE id = '10000000-0000-0000-0000-000000000895';

DO $$
BEGIN
  UPDATE public.demandas_sugeridas SET status = 'feita' WHERE id = '10000000-0000-0000-0000-000000000895';
  RAISE EXCEPTION 'aceitou status inválido';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

DO $$
BEGIN
  UPDATE public.demandas_sugeridas SET titulo = 'outro' WHERE id = '10000000-0000-0000-0000-000000000895';
  RAISE EXCEPTION 'app reescreveu a sugestão';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

DO $$
BEGIN
  INSERT INTO public.demandas_sugeridas(cliente_id, membro_id, titulo) VALUES
   ('10000000-0000-0000-0000-000000000893', '10000000-0000-0000-0000-000000000894', 'X');
  RAISE EXCEPTION 'app criou sugestão';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000892',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.demandas_sugeridas) THEN RAISE EXCEPTION 'outra conta viu'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000891',true);
DELETE FROM public.demandas_sugeridas WHERE id = '10000000-0000-0000-0000-000000000895';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.demandas_sugeridas WHERE id = '10000000-0000-0000-0000-000000000895') THEN RAISE EXCEPTION 'não apagou'; END IF;
END $$;
ROLLBACK;
