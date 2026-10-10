-- Regressão: Atalho do iPhone → fila do Creator.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000083','atalho-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000082','atalho-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000083',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t_token ON COMMIT DROP AS SELECT public.gerar_token_atalho() AS token;
GRANT SELECT ON t_token TO anon;
DO $$
BEGIN
 IF (SELECT public.atalho_configurado()) IS NULL THEN RAISE EXCEPTION 'token não ficou registrado'; END IF;
 BEGIN
   PERFORM 1 FROM public.creator_atalho_tokens;
   RAISE EXCEPTION 'app conseguiu ler a tabela de tokens';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.creator_links(user_id, link) VALUES (auth.uid(), 'https://x.com');
   RAISE EXCEPTION 'app inseriu link direto (sem passar pelo token)';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE v_token text;
BEGIN
 SELECT token INTO v_token FROM t_token;
 IF public.receber_link_atalho(v_token, 'Olha esse reel https://www.instagram.com/reel/ABC/?igsh=1') <> 'Enviado pro Jarvis' THEN
   RAISE EXCEPTION 'não aceitou link válido';
 END IF;
 BEGIN
   PERFORM public.receber_link_atalho('token-errado', 'https://www.instagram.com/reel/X/');
   RAISE EXCEPTION 'aceitou token errado';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.receber_link_atalho(v_token, 'sem link aqui');
   RAISE EXCEPTION 'aceitou texto sem link';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
   PERFORM public.gerar_token_atalho();
   RAISE EXCEPTION 'anônimo gerou token';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000083',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT link FROM public.creator_links LIMIT 1) <> 'https://www.instagram.com/reel/ABC/?igsh=1' THEN
   RAISE EXCEPTION 'link não chegou na fila do dono (ou veio com texto junto)';
 END IF;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000082',true);
 IF EXISTS (SELECT 1 FROM public.creator_links) THEN RAISE EXCEPTION 'outra conta vê a fila alheia'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
