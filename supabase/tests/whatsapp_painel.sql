-- Regressão: painel do WhatsApp só é visto e marcado pelo dono.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000093','whats-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000092','whats-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000093',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE changed integer;
BEGIN
 INSERT INTO public.whatsapp_painel(cards) VALUES ('[{"id":"teste1"}]');
 UPDATE public.whatsapp_painel SET respondidos = '{"teste1":true}' WHERE user_id = auth.uid();
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Dono não conseguiu marcar respondido'; END IF;

 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000092',true);
 IF EXISTS (SELECT 1 FROM public.whatsapp_painel) THEN
   RAISE EXCEPTION 'Outra conta enxerga o painel alheio';
 END IF;
 UPDATE public.whatsapp_painel SET respondidos = '{}' WHERE user_id = '10000000-0000-0000-0000-000000000093';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta mexeu no painel alheio'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
