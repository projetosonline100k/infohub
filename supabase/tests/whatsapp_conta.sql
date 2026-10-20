-- Regressão: a lista de conversas separa os números (conta) e só mostra as do dono.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000281','wa-conta-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000282','wa-conta-outro@example.com',now());
INSERT INTO public.whatsapp_mensagens(id, user_id, chat_id, chat_nome, eh_grupo, de_mim, tipo, texto, enviada_em, conta) VALUES
 ('t-wa-1', '10000000-0000-0000-0000-000000000281', 'a@c.us', 'Cliente', false, false, 'texto', 'oi', now(), 'principal'),
 ('t-wa-2', '10000000-0000-0000-0000-000000000281', 'b@c.us', 'Mãe', false, false, 'texto', 'oi filho', now(), 'pessoal'),
 ('t-wa-3', '10000000-0000-0000-0000-000000000282', 'c@c.us', 'Outro', false, false, 'texto', 'x', now(), 'pessoal');
INSERT INTO public.whatsapp_mensagens(id, user_id, chat_id, eh_grupo, de_mim, tipo, texto, enviada_em)
 VALUES ('t-wa-4', '10000000-0000-0000-0000-000000000281', 'd@c.us', false, true, 'texto', 'sem conta', now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000281',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT array_agg(chat_id ORDER BY chat_id) FROM public.whatsapp_conversas()) <> ARRAY['a@c.us','d@c.us'] THEN
    RAISE EXCEPTION 'principal (padrão) errado: %', (SELECT array_agg(chat_id) FROM public.whatsapp_conversas()); END IF;
  IF (SELECT array_agg(chat_id) FROM public.whatsapp_conversas(200, 'pessoal')) <> ARRAY['b@c.us'] THEN
    RAISE EXCEPTION 'pessoal errado (ou viu conversa de outro dono)'; END IF;
END $$;
ROLLBACK;
