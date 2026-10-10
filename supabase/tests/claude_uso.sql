-- Regressão: uso do Claude — dono só lê; outra conta não vê; app não escreve.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000087','uso-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000086','uso-outsider-test@example.com',now());
INSERT INTO public.claude_uso(user_id, plano, janela_5h_pct, semanal_pct) VALUES ('10000000-0000-0000-0000-000000000087', 'Pro', 20, 55);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000087',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.claude_uso) THEN RAISE EXCEPTION 'Dono não vê o próprio uso'; END IF;
 BEGIN
   UPDATE public.claude_uso SET semanal_pct = 0;
   RAISE EXCEPTION 'App conseguiu alterar o uso';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000086',true);
 IF EXISTS (SELECT 1 FROM public.claude_uso) THEN RAISE EXCEPTION 'Outra conta vê uso alheio'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
