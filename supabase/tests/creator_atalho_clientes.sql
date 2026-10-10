-- Regressão: atalho de cliente — só o dono do projeto gera; o link chega na
-- fila do dono com o cliente de destino; ninguém lê o hash.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000077','atalhocli-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000076','atalhocli-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000077',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t_cli ON COMMIT DROP AS SELECT NULL::uuid AS cliente, NULL::text AS token;
DO $$
DECLARE v_cliente uuid;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Teste atalho cli', 30, 'x', auth.uid()) RETURNING id INTO v_cliente;
 UPDATE t_cli SET cliente = v_cliente, token = public.gerar_token_atalho_cliente(v_cliente);
 INSERT INTO t_cli SELECT v_cliente, public.gerar_token_atalho_cliente(v_cliente) WHERE NOT EXISTS (SELECT 1 FROM t_cli WHERE cliente IS NOT NULL);
 BEGIN
   PERFORM token_hash FROM public.creator_atalho_clientes;
   RAISE EXCEPTION 'app leu o hash do token';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000076',true);
 BEGIN
   PERFORM public.gerar_token_atalho_cliente(v_cliente);
   RAISE EXCEPTION 'quem não é dono gerou atalho do projeto';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
DECLARE v_token text; v_cliente uuid;
BEGIN
 SELECT token, cliente INTO v_token, v_cliente FROM t_cli WHERE token IS NOT NULL LIMIT 1;
 IF public.receber_link_atalho(v_token, 'https://www.instagram.com/reel/CLI/') <> 'Enviado pras Ideias em destaque' THEN
   RAISE EXCEPTION 'atalho de cliente não reconhecido';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.creator_links WHERE link = 'https://www.instagram.com/reel/CLI/'
                AND cliente_id = v_cliente AND user_id = '10000000-0000-0000-0000-000000000077') THEN
   RAISE EXCEPTION 'link não foi pra fila do dono com o cliente de destino';
 END IF;
END $$;
ROLLBACK;
