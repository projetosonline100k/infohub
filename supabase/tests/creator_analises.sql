-- Regressão: análises do Creator — dono pede e vê; não forja resultado; outra conta não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000081','analise-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000080','analise-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE changed integer;
BEGIN
 INSERT INTO public.creator_analises(nicho_livre, transcricao_ids) VALUES ('produtividade', ARRAY[gen_random_uuid()]);
 BEGIN
   INSERT INTO public.creator_analises(nicho_livre, transcricao_ids, status, resultado) VALUES ('x', ARRAY[gen_random_uuid()], 'pronta', '{}');
   RAISE EXCEPTION 'app gravou análise já pronta (resultado forjado)';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   UPDATE public.creator_analises SET resultado = '{}' ;
   RAISE EXCEPTION 'app alterou o resultado';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000080',true);
 IF EXISTS (SELECT 1 FROM public.creator_analises) THEN RAISE EXCEPTION 'outra conta vê análise alheia'; END IF;
 DELETE FROM public.creator_analises;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'outra conta apagou análise alheia'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
