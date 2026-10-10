-- Regressão: conversa do Jarvis — dono escreve só como 'davi'; outra conta não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000091','conversa-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000090','conversa-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000091',true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
 INSERT INTO public.jarvis_conversa(papel, texto, status) VALUES ('davi', 'oi', 'enviada');
 BEGIN
   INSERT INTO public.jarvis_conversa(papel, texto) VALUES ('claude', 'resposta forjada');
   RAISE EXCEPTION 'App conseguiu gravar como claude';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000090',true);
 IF EXISTS (SELECT 1 FROM public.jarvis_conversa) THEN
   RAISE EXCEPTION 'Outra conta enxerga a conversa alheia';
 END IF;
END $$;

RESET ROLE;
ROLLBACK;
