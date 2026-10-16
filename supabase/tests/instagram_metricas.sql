-- Regressão: métricas diárias do Instagram ganham o projeto da conexão (a geral
-- vale só pro Davi Queiroz); o dono lê, o app não grava, estranho não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000231','metricas-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000232','metricas-alheio-test@example.com',now());
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000233', 'Métricas teste', 30, 'x', '10000000-0000-0000-0000-000000000231');
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token) VALUES
 ('10000000-0000-0000-0000-000000000231', '10000000-0000-0000-0000-000000000233', 'ig-metricas-projeto', 'projeto', 'x'),
 ('10000000-0000-0000-0000-000000000231', NULL, 'ig-metricas-geral', 'geral', 'x');

-- A edge function (service_role) grava; o trigger completa dono e projeto.
INSERT INTO public.instagram_metricas_diarias(ig_user_id, dia, seguidores) VALUES
 ('ig-metricas-projeto', '2026-10-14', 100),
 ('ig-metricas-geral', '2026-10-14', 200);
DO $$
DECLARE r record;
BEGIN
 SELECT user_id, cliente_id INTO r FROM public.instagram_metricas_diarias WHERE ig_user_id = 'ig-metricas-projeto';
 IF r.user_id <> '10000000-0000-0000-0000-000000000231' OR r.cliente_id <> '10000000-0000-0000-0000-000000000233' THEN
   RAISE EXCEPTION 'projeto errado: %', r; END IF;
 -- A conexão geral de outro dono não cai no projeto Davi Queiroz.
 SELECT cliente_id INTO r FROM public.instagram_metricas_diarias WHERE ig_user_id = 'ig-metricas-geral';
 IF r.cliente_id IS NOT NULL THEN RAISE EXCEPTION 'conexão geral virou projeto: %', r; END IF;
END $$;

-- A conta geral do Davi vale para o projeto Davi Queiroz.
DO $$
DECLARE v_dono uuid; v_cliente uuid;
BEGIN
 SELECT user_id INTO v_dono FROM public.clientes WHERE id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';
 IF v_dono IS NULL THEN RETURN; END IF;
 INSERT INTO public.instagram_conexoes(user_id, ig_user_id, username, access_token)
   VALUES (v_dono, 'ig-metricas-davi', 'davi', 'x');
 INSERT INTO public.instagram_metricas_diarias(ig_user_id, dia) VALUES ('ig-metricas-davi', '2026-10-14')
   RETURNING cliente_id INTO v_cliente;
 IF v_cliente IS DISTINCT FROM 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' THEN
   RAISE EXCEPTION 'conta geral do Davi sem o projeto Davi Queiroz: %', v_cliente; END IF;
END $$;

-- O dono lê; não grava pelo app.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000231',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.instagram_metricas_diarias WHERE ig_user_id LIKE 'ig-metricas-%') <> 2 THEN
   RAISE EXCEPTION 'dono não vê as métricas'; END IF;
 BEGIN
   INSERT INTO public.instagram_metricas_diarias(ig_user_id, dia) VALUES ('ig-metricas-projeto', '2026-10-15');
   RAISE EXCEPTION 'app conseguiu gravar';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Quem não é dono nem da equipe não vê nada.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000232',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.instagram_metricas_diarias WHERE ig_user_id LIKE 'ig-metricas-%') THEN
   RAISE EXCEPTION 'estranho vê métricas'; END IF;
END $$;
RESET ROLE;

-- A chave do cron não abre para o app.
DO $$
BEGIN
 IF has_function_privilege('authenticated', 'public.instagram_metricas_chave_ok(text)', 'execute') THEN
   RAISE EXCEPTION 'app executa a conferência da chave'; END IF;
 IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-metricas') THEN
   RAISE EXCEPTION 'rotina diária não agendada'; END IF;
END $$;
ROLLBACK;
