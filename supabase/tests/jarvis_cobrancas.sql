-- Regressão: cobranças do Jarvis — dono só responde (não cria nem reescreve
-- o texto); outra conta não vê nem mexe.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000089','cobranca-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000088','cobranca-outsider-test@example.com',now());
INSERT INTO public.jarvis_cobrancas(id, user_id, titulo, texto)
 VALUES ('20000000-0000-0000-0000-000000000089', '10000000-0000-0000-0000-000000000089', 'Teste', 'Faz agora');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000089',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE changed integer;
BEGIN
 UPDATE public.jarvis_cobrancas SET status = 'adiada', adiada_ate = now() + interval '30 minutes', vezes_adiada = 1
  WHERE id = '20000000-0000-0000-0000-000000000089';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Dono não conseguiu adiar'; END IF;
 BEGIN
   UPDATE public.jarvis_cobrancas SET texto = 'reescrito' WHERE id = '20000000-0000-0000-0000-000000000089';
   RAISE EXCEPTION 'App conseguiu reescrever o texto da cobrança';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.jarvis_cobrancas(user_id, titulo, texto) VALUES (auth.uid(), 'x', 'y');
   RAISE EXCEPTION 'App conseguiu criar cobrança';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000088',true);
 IF EXISTS (SELECT 1 FROM public.jarvis_cobrancas) THEN RAISE EXCEPTION 'Outra conta enxerga cobrança alheia'; END IF;
 UPDATE public.jarvis_cobrancas SET status = 'feita' WHERE id = '20000000-0000-0000-0000-000000000089';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta respondeu cobrança alheia'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
