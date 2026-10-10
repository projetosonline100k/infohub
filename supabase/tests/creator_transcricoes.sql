-- Regressão: transcrições do Creator só do dono.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000085','creator-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000084','creator-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000085',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE changed integer;
BEGIN
 INSERT INTO public.creator_transcricoes(link, texto) VALUES ('https://exemplo.com/v', 'olá');
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000084',true);
 IF EXISTS (SELECT 1 FROM public.creator_transcricoes) THEN RAISE EXCEPTION 'Outra conta vê transcrição alheia'; END IF;
 DELETE FROM public.creator_transcricoes;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta apagou transcrição alheia'; END IF;
 BEGIN
   INSERT INTO public.creator_transcricoes(user_id, link, texto) VALUES ('10000000-0000-0000-0000-000000000085', 'x', 'y');
   RAISE EXCEPTION 'Gravou transcrição em nome de outra conta';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
