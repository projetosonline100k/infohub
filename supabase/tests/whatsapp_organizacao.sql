-- Regressão: arquivar e pastas do WhatsApp são só do dono; apagar a pasta solta as conversas dela.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000311','wa-org@example.com',now()),
 ('10000000-0000-0000-0000-000000000312','wa-org-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000311',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.whatsapp_pastas(id, conta, nome) VALUES ('20000000-0000-0000-0000-000000000311', 'pessoal', 'Família');
INSERT INTO public.whatsapp_organizacao(conta, chat_id, arquivada, pasta_id) VALUES
 ('pessoal', 'a@g.us', true, NULL), ('pessoal', 'b@c.us', false, '20000000-0000-0000-0000-000000000311');
DELETE FROM public.whatsapp_pastas WHERE id = '20000000-0000-0000-0000-000000000311';
DO $$
BEGIN
  IF (SELECT pasta_id FROM public.whatsapp_organizacao WHERE chat_id = 'b@c.us') IS NOT NULL THEN
    RAISE EXCEPTION 'apagar a pasta não soltou a conversa'; END IF;
  IF (SELECT count(*) FROM public.whatsapp_organizacao) <> 2 THEN RAISE EXCEPTION 'dono não vê as suas'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000312',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_organizacao) THEN RAISE EXCEPTION 'outro usuário viu o arquivo alheio'; END IF;
END $$;
ROLLBACK;
