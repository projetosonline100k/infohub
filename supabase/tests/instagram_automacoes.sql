-- Regressão: automações do Instagram — dono gerencia as suas, só em contas
-- conectadas dele; ninguém do app lê a conexão (token) nem os links OAuth;
-- disparos são só leitura para o dono.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000119','ig-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000118','ig-outsider-test@example.com',now());
INSERT INTO public.instagram_conexoes(ig_user_id, user_id, access_token, username)
 VALUES ('ig-teste', '10000000-0000-0000-0000-000000000119', 'token-secreto', 'dono'),
        ('ig-alheia', '10000000-0000-0000-0000-000000000118', 'token-alheio', 'outro');
INSERT INTO public.instagram_automacoes(id, user_id, ig_user_id, nome, palavras_chave, mensagem_dm)
 VALUES ('20000000-0000-0000-0000-000000000119', '10000000-0000-0000-0000-000000000119', 'ig-teste', 'Teste', '{QUERO}', 'oi');
INSERT INTO public.instagram_automacao_disparos(user_id, automacao_id, evento_id, ig_user_id)
 VALUES ('10000000-0000-0000-0000-000000000119', '20000000-0000-0000-0000-000000000119', 'c-1', 'ig-teste');
INSERT INTO public.instagram_oauth_states(state, user_id) VALUES ('s-1', '10000000-0000-0000-0000-000000000119');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000119',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 BEGIN
   PERFORM 1 FROM public.instagram_conexoes;
   RAISE EXCEPTION 'app leu a tabela com o token';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM 1 FROM public.instagram_oauth_states;
   RAISE EXCEPTION 'app leu os links de conexão';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF NOT EXISTS (SELECT 1 FROM public.instagram_automacoes) THEN RAISE EXCEPTION 'dono não vê a automação'; END IF;
 IF (SELECT count(*) FROM public.instagram_contas()) <> 1 THEN RAISE EXCEPTION 'dono não vê só a própria conta'; END IF;
 BEGIN
   INSERT INTO public.instagram_automacoes(user_id, ig_user_id, nome, palavras_chave, mensagem_dm, gatilhos) VALUES (auth.uid(), 'ig-teste', 'Inválida', '{X}', 'x', '{email}');
   RAISE EXCEPTION 'aceitou gatilho inválido';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
   INSERT INTO public.instagram_automacoes(user_id, ig_user_id, nome, palavras_chave, mensagem_dm) VALUES (auth.uid(), 'ig-alheia', 'Intrusa', '{X}', 'x');
   RAISE EXCEPTION 'criou automação na conta do Instagram de outro usuário';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF NOT EXISTS (SELECT 1 FROM public.instagram_automacao_disparos) THEN RAISE EXCEPTION 'dono não vê os disparos'; END IF;
 INSERT INTO public.instagram_automacoes(user_id, ig_user_id, nome, palavras_chave, mensagem_dm) VALUES (auth.uid(), 'ig-teste', 'Outra', '{EU}', 'x');
 BEGIN
   INSERT INTO public.instagram_automacao_disparos(user_id, evento_id) VALUES (auth.uid(), 'forjado');
   RAISE EXCEPTION 'app gravou disparo';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000118',true);
 IF EXISTS (SELECT 1 FROM public.instagram_automacoes) THEN RAISE EXCEPTION 'outra conta vê automações alheias'; END IF;
 IF EXISTS (SELECT 1 FROM public.instagram_automacao_disparos) THEN RAISE EXCEPTION 'outra conta vê disparos alheios'; END IF;
 IF EXISTS (SELECT 1 FROM public.instagram_contas() WHERE ig_user_id = 'ig-teste') THEN RAISE EXCEPTION 'outra conta vê a conexão alheia'; END IF;
 UPDATE public.instagram_automacoes SET ativo = false;
 DELETE FROM public.instagram_automacoes;
 BEGIN
   INSERT INTO public.instagram_automacoes(user_id, ig_user_id, nome, palavras_chave, mensagem_dm)
    VALUES ('10000000-0000-0000-0000-000000000119', 'ig-teste', 'Forjada', '{X}', 'x');
   RAISE EXCEPTION 'outra conta criou automação em nome do dono';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000119',true);
 IF (SELECT count(*) FROM public.instagram_automacoes WHERE ativo) <> 2 THEN RAISE EXCEPTION 'outra conta mexeu nas automações do dono'; END IF;
END $$;
ROLLBACK;
