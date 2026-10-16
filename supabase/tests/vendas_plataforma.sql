-- Regressão: venda e reembolso da plataforma somam no dia do produto (sem
-- duplicar quando a plataforma reenvia); só o dono pega o link e vê os eventos.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000241','vendas-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000242','vendas-alheio-test@example.com',now());
-- team_stamp_owner carimba o dono pelo auth.uid().
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000241',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000243', 'Vendas teste', 30, 'x', '10000000-0000-0000-0000-000000000241');
INSERT INTO public.produtos_cliente(id, cliente_id, nome_produto, user_id)
 VALUES ('10000000-0000-0000-0000-000000000244', '10000000-0000-0000-0000-000000000243', 'Curso', '10000000-0000-0000-0000-000000000241');
-- Já existe um lançamento à mão no dia: a venda soma em cima dele.
INSERT INTO public.produto_financeiro_diario(produto_id, data, receita, vendas_quantidade, user_id)
 VALUES ('10000000-0000-0000-0000-000000000244', '2026-10-15', 100, 1, '10000000-0000-0000-0000-000000000241');

-- A edge function (service_role) grava os eventos.
INSERT INTO public.vendas_plataforma_eventos(produto_id, plataforma, transacao_id, tipo, valor, data) VALUES
 ('10000000-0000-0000-0000-000000000244', 'kiwify', 't1', 'venda', 97, '2026-10-15'),
 ('10000000-0000-0000-0000-000000000244', 'kiwify', 't2', 'venda', 197, '2026-10-16'),
 ('10000000-0000-0000-0000-000000000244', 'kiwify', 't1', 'reembolso', 97, '2026-10-16');
INSERT INTO public.vendas_plataforma_eventos(produto_id, plataforma, transacao_id, tipo, valor, data)
 VALUES ('10000000-0000-0000-0000-000000000244', 'kiwify', 't1', 'venda', 97, '2026-10-15')
 ON CONFLICT DO NOTHING;

DO $$
DECLARE r record;
BEGIN
 SELECT receita, reembolsos, vendas_quantidade INTO r FROM public.produto_financeiro_diario
  WHERE produto_id = '10000000-0000-0000-0000-000000000244' AND data = '2026-10-15';
 IF r.receita <> 197 OR r.vendas_quantidade <> 2 OR coalesce(r.reembolsos, 0) <> 0 THEN
   RAISE EXCEPTION 'dia 15 errado: %', r; END IF;
 SELECT receita, reembolsos, vendas_quantidade, user_id::text AS dono INTO r FROM public.produto_financeiro_diario
  WHERE produto_id = '10000000-0000-0000-0000-000000000244' AND data = '2026-10-16';
 IF r.receita <> 197 OR r.reembolsos <> 97 OR r.vendas_quantidade <> 1
    OR r.dono <> '10000000-0000-0000-0000-000000000241' THEN
   RAISE EXCEPTION 'dia 16 errado: %', r; END IF;
END $$;

-- O dono pega o link (a mesma chave nas duas vezes) e vê os eventos.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000241',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v1 text; v2 text;
BEGIN
 v1 := public.produto_vendas_webhook_chave('10000000-0000-0000-0000-000000000244');
 v2 := public.produto_vendas_webhook_chave('10000000-0000-0000-0000-000000000244');
 IF v1 IS NULL OR length(v1) < 40 OR v1 <> v2 THEN RAISE EXCEPTION 'chave errada: % %', v1, v2; END IF;
 IF (SELECT count(*) FROM public.vendas_plataforma_eventos) <> 3 THEN
   RAISE EXCEPTION 'dono não vê os eventos'; END IF;
 BEGIN
   INSERT INTO public.vendas_plataforma_eventos(produto_id, plataforma, transacao_id, tipo, valor, data)
     VALUES ('10000000-0000-0000-0000-000000000244', 'kiwify', 't9', 'venda', 1, '2026-10-15');
   RAISE EXCEPTION 'app gravou evento';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM 1 FROM public.produto_vendas_webhook;
   RAISE EXCEPTION 'app leu as chaves';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Estranho não pega o link nem vê os eventos.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000242',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.vendas_plataforma_eventos) THEN RAISE EXCEPTION 'estranho vê eventos'; END IF;
 BEGIN
   PERFORM public.produto_vendas_webhook_chave('10000000-0000-0000-0000-000000000244');
   RAISE EXCEPTION 'estranho pegou o link';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.vendas_plataforma_desfazer(
     (SELECT id FROM public.vendas_plataforma_eventos WHERE transacao_id = 't2'));
   RAISE EXCEPTION 'estranho desfez';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- O dono desfaz a venda de teste: o dia volta ao que era.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000241',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r record;
BEGIN
 PERFORM public.vendas_plataforma_desfazer(
   (SELECT id FROM public.vendas_plataforma_eventos WHERE transacao_id = 't2'));
 SELECT receita, reembolsos, vendas_quantidade INTO r FROM public.produto_financeiro_diario
  WHERE produto_id = '10000000-0000-0000-0000-000000000244' AND data = '2026-10-16';
 IF r.receita <> 0 OR r.reembolsos <> 97 OR r.vendas_quantidade <> 0 THEN
   RAISE EXCEPTION 'desfazer errado: %', r; END IF;
 IF EXISTS (SELECT 1 FROM public.vendas_plataforma_eventos WHERE transacao_id = 't2') THEN
   RAISE EXCEPTION 'evento ficou'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
