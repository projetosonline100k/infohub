-- Regressão: bloqueador só do dono, e desligar antes da hora exige motivo.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000291','bloq-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000292','bloq-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000291',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.bloqueador_config(apps, sites) VALUES ('["WhatsApp"]', '["instagram.com"]');
INSERT INTO public.bloqueador_sessoes(id, fim_previsto) VALUES ('20000000-0000-0000-0000-000000000291', now() + interval '1 hour');
DO $$
BEGIN
  BEGIN
    UPDATE public.bloqueador_sessoes SET encerrado_em = now() WHERE id = '20000000-0000-0000-0000-000000000291';
    RAISE EXCEPTION 'desligou antes da hora sem motivo';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.bloqueador_sessoes SET encerrado_em = now(), motivo_saida = 'reunião com cliente'
   WHERE id = '20000000-0000-0000-0000-000000000291';
  IF NOT FOUND THEN RAISE EXCEPTION 'com motivo deveria encerrar'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000292',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bloqueador_config) OR EXISTS (SELECT 1 FROM public.bloqueador_sessoes) THEN
    RAISE EXCEPTION 'outro usuário viu o bloqueador alheio'; END IF;
END $$;
ROLLBACK;
