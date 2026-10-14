-- Regressão: mensagens do WhatsApp — só o dono lê/apaga; o app não grava.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000109','wa-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000108','wa-outsider-test@example.com',now());
INSERT INTO public.whatsapp_mensagens(id, user_id, chat_id, texto, enviada_em)
 VALUES ('teste-1', '10000000-0000-0000-0000-000000000109', '551199@c.us', 'oi', now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000109',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.whatsapp_mensagens WHERE id = 'teste-1') THEN RAISE EXCEPTION 'dono não vê a mensagem'; END IF;
 IF (SELECT count(*) FROM public.whatsapp_conversas()) <> 1 THEN RAISE EXCEPTION 'lista de conversas errada'; END IF;
 BEGIN
   INSERT INTO public.whatsapp_mensagens(id, user_id, chat_id, texto, enviada_em) VALUES ('forjada', auth.uid(), 'x', 'x', now());
   RAISE EXCEPTION 'app gravou mensagem';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000108',true);
 IF EXISTS (SELECT 1 FROM public.whatsapp_mensagens) THEN RAISE EXCEPTION 'outra conta vê mensagens alheias'; END IF;
 IF EXISTS (SELECT 1 FROM public.whatsapp_conversas()) THEN RAISE EXCEPTION 'outra conta vê conversas alheias'; END IF;
 DELETE FROM public.whatsapp_mensagens WHERE id = 'teste-1';
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000109',true);
 IF NOT EXISTS (SELECT 1 FROM public.whatsapp_mensagens WHERE id = 'teste-1') THEN RAISE EXCEPTION 'outra conta apagou mensagem alheia'; END IF;
END $$;
ROLLBACK;
