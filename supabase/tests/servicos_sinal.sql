-- Regressão: o sinal do ouvinte só é visto pelo dono e o app não grava.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000083','sinal-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000082','sinal-outsider-test@example.com',now());
INSERT INTO public.servicos_sinal(user_id, servico) VALUES ('10000000-0000-0000-0000-000000000083','ouvinte');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000083',true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.servicos_sinal WHERE servico = 'ouvinte') THEN
   RAISE EXCEPTION 'Dono não vê o sinal do ouvinte';
 END IF;
 BEGIN
   UPDATE public.servicos_sinal SET ultimo_sinal = now() WHERE servico = 'ouvinte';
   RAISE EXCEPTION 'App conseguiu gravar o sinal';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000082',true);
 IF EXISTS (SELECT 1 FROM public.servicos_sinal) THEN
   RAISE EXCEPTION 'Outra conta enxerga o sinal alheio';
 END IF;
END $$;

RESET ROLE;
ROLLBACK;
