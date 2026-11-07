-- Regressão: evento da Eduzz entra; eventos do funil (pendente, recusada, abandono) não mexem no faturamento;
-- a origem (UTM) fica guardada.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000251','vendas-eduzz-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000251',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000253', 'Eduzz teste', 30, 'x', '10000000-0000-0000-0000-000000000251');
INSERT INTO public.produtos_cliente(id, cliente_id, nome_produto, user_id)
 VALUES ('10000000-0000-0000-0000-000000000254', '10000000-0000-0000-0000-000000000253', 'Livro', '10000000-0000-0000-0000-000000000251');

INSERT INTO public.vendas_plataforma_eventos(produto_id, plataforma, transacao_id, tipo, valor, data, utm_source, utm_campaign, metodo_pagamento) VALUES
 ('10000000-0000-0000-0000-000000000254', 'eduzz', 'f1', 'pendente', 47, '2026-11-07', 'instagram', 'bio', 'pix'),
 ('10000000-0000-0000-0000-000000000254', 'eduzz', 'f1', 'venda', 47, '2026-11-07', 'instagram', 'bio', 'pix'),
 ('10000000-0000-0000-0000-000000000254', 'eduzz', 'f2', 'recusada', 47, '2026-11-07', 'facebook', 'ads', 'cartao'),
 ('10000000-0000-0000-0000-000000000254', 'eduzz', 'c1', 'abandono', 47, '2026-11-07', NULL, NULL, NULL);

DO $$
DECLARE r record;
BEGIN
 SELECT receita, coalesce(reembolsos, 0) AS reemb, vendas_quantidade INTO r FROM public.produto_financeiro_diario
  WHERE produto_id = '10000000-0000-0000-0000-000000000254' AND data = '2026-11-07';
 IF r.receita <> 47 OR r.reemb <> 0 OR r.vendas_quantidade <> 1 THEN
   RAISE EXCEPTION 'funil mexeu no faturamento: %', r; END IF;
 IF (SELECT utm_source FROM public.vendas_plataforma_eventos WHERE transacao_id = 'f1' AND tipo = 'venda') <> 'instagram' THEN
   RAISE EXCEPTION 'utm não ficou'; END IF;
 BEGIN
   INSERT INTO public.vendas_plataforma_eventos(produto_id, plataforma, transacao_id, tipo, valor, data)
     VALUES ('10000000-0000-0000-0000-000000000254', 'outra', 'x', 'venda', 1, '2026-11-07');
   RAISE EXCEPTION 'aceitou plataforma estranha';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
ROLLBACK;
