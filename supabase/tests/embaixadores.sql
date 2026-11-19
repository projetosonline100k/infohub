-- Embaixadores: o dono cadastra; o embaixador (com convite aceito) vê SÓ o que é dele, sem contato dos leads; outra pessoa não vê nada.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  ('10000000-0000-0000-0000-000000000401','emb-dono@example.com',now()),
  ('10000000-0000-0000-0000-000000000402','emb-ana@example.com',now()),
  ('10000000-0000-0000-0000-000000000403','emb-estranho@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000401',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000404', 'EMB', 30, 'x', '10000000-0000-0000-0000-000000000401');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug) VALUES ('10000000-0000-0000-0000-000000000405', '10000000-0000-0000-0000-000000000404', 'Quiz EMB', 'quiz-emb-teste');
INSERT INTO public.produtos_cliente(id, cliente_id, nome_produto) VALUES ('10000000-0000-0000-0000-000000000406', '10000000-0000-0000-0000-000000000404', 'Mentoria');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000401',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.embaixadores(id, cliente_id, nome, email, codigo, comissao_pct) VALUES ('10000000-0000-0000-0000-000000000407', '10000000-0000-0000-0000-000000000404', 'Ana', 'emb-ana@example.com', 'ana1', 20);
INSERT INTO public.embaixadores(cliente_id, nome, email, codigo) VALUES ('10000000-0000-0000-0000-000000000404', 'Bia', 'bia@example.com', 'bia1');
INSERT INTO public.embaixador_links(cliente_id, titulo, destino) VALUES ('10000000-0000-0000-0000-000000000404', 'Quiz', 'https://x.com/quiz/a'), ('10000000-0000-0000-0000-000000000404', 'Só da Bia', 'https://x.com/b');
DO $$ BEGIN
  BEGIN UPDATE public.embaixadores SET codigo = 'outro1'; RAISE EXCEPTION 'trocou o código';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.embaixadores(cliente_id, nome, email, codigo) VALUES ('10000000-0000-0000-0000-000000000404', 'X', 'x@x.com', 'ana1'); RAISE EXCEPTION 'código repetido';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.embaixador_links SET embaixador_id = '10000000-0000-0000-0000-000000000407' WHERE titulo <> 'Quiz' AND false;
-- dados: um lead da Ana (comprou), um lead sem marca, uma venda com marca no checkout, uma venda de outra pessoa
INSERT INTO public.quiz_respostas(quiz_id, cliente_id, respostas, nome, email, whatsapp, utm, status) VALUES
  ('10000000-0000-0000-0000-000000000405', '10000000-0000-0000-0000-000000000404', '{}', 'Carlos Souza', 'carlos@x.com', '11999990000', '{"utm_content":"aff_ana1"}', 'novo'),
  ('10000000-0000-0000-0000-000000000405', '10000000-0000-0000-0000-000000000404', '{}', 'Lead Sem Marca', 'sem@x.com', '11888880000', '{}', 'novo');
INSERT INTO public.vendas_plataforma_eventos(produto_id, plataforma, transacao_id, tipo, valor, data, comprador_nome, comprador_email, utm_content) VALUES
  ('10000000-0000-0000-0000-000000000406', 'kiwify', 't1', 'venda', 1000, current_date, 'Carlos Souza', 'carlos@x.com', NULL),
  ('10000000-0000-0000-0000-000000000406', 'kiwify', 't2', 'venda', 500, current_date, 'Outro', 'sem@x.com', 'aff_bia1');
-- antes do convite ser aceito: sem acesso
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000402',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.embaixador_painel(30); RAISE EXCEPTION 'viu antes de aceitar';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.embaixadores) <> 0 THEN RAISE EXCEPTION 'embaixador leu a tabela direto'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE tk uuid; BEGIN
  SELECT convite INTO tk FROM public.embaixadores WHERE codigo = 'ana1';
  IF public.embaixador_convite_info(tk)->>'email' <> 'emb-ana@example.com' THEN RAISE EXCEPTION 'info do convite'; END IF;
  PERFORM set_config('teste.tk', tk::text, true);
END $$;
SET LOCAL ROLE authenticated;
-- outra pessoa não consegue usar o convite (e-mail diferente)
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000403',true);
DO $$ BEGIN
  BEGIN PERFORM public.embaixador_aceitar_convite(current_setting('teste.tk')::uuid); RAISE EXCEPTION 'aceitou convite de outro e-mail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000402',true);
SELECT public.embaixador_aceitar_convite(current_setting('teste.tk')::uuid);
DO $$ DECLARE p jsonb; BEGIN
  p := public.embaixador_painel(30);
  IF (p->>'leads')::int <> 1 THEN RAISE EXCEPTION 'leads: %', p; END IF;
  IF (p->>'vendas')::int <> 1 OR (p->>'bruto')::numeric <> 1000 THEN RAISE EXCEPTION 'vendas (via lead): %', p; END IF;
  IF (SELECT count(*) FROM public.embaixador_leads()) <> 1 THEN RAISE EXCEPTION 'lista de leads'; END IF;
  IF (SELECT etapa FROM public.embaixador_leads()) <> 'Comprou' THEN RAISE EXCEPTION 'etapa do lead'; END IF;
  IF (SELECT count(*) FROM public.embaixador_vendas()) <> 1 OR (SELECT comissao FROM public.embaixador_vendas()) <> 200 THEN RAISE EXCEPTION 'vendas/comissão'; END IF;
  IF (SELECT comprador FROM public.embaixador_vendas()) <> 'Carlos' THEN RAISE EXCEPTION 'só o primeiro nome'; END IF;
  IF (SELECT count(*) FROM public.embaixador_esteira()) <> 1 THEN RAISE EXCEPTION 'esteira'; END IF;
  IF (SELECT count(*) FROM public.embaixador_links_meus()) <> 2 THEN RAISE EXCEPTION 'links'; END IF;
  IF public.embaixador_eu()->>'codigo' <> 'ana1' THEN RAISE EXCEPTION 'eu'; END IF;
  IF (SELECT count(*) FROM public.quiz_respostas) <> 0 THEN RAISE EXCEPTION 'embaixador leu a tabela de leads'; END IF;
  BEGIN PERFORM public.embaixador_aceitar_convite(current_setting('teste.tk')::uuid); RAISE EXCEPTION 'convite reutilizado';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
-- quem não é embaixador não acessa
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000403',true);
DO $$ BEGIN
  BEGIN PERFORM public.embaixador_leads(); RAISE EXCEPTION 'estranho viu leads';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- visão do administrador: o dono vê o resumo e as vendas; outra pessoa não
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000401',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT bruto FROM public.embaixadores_resumo('10000000-0000-0000-0000-000000000404', 30) WHERE embaixador_id = '10000000-0000-0000-0000-000000000407') <> 1000 THEN RAISE EXCEPTION 'resumo do admin'; END IF;
  IF (SELECT leads FROM public.embaixadores_resumo('10000000-0000-0000-0000-000000000404', 30) WHERE embaixador_id = '10000000-0000-0000-0000-000000000407') <> 1 THEN RAISE EXCEPTION 'leads do admin'; END IF;
  IF (SELECT count(*) FROM public.embaixador_vendas_admin('10000000-0000-0000-0000-000000000407')) <> 1 THEN RAISE EXCEPTION 'vendas do admin'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000403',true);
DO $$ BEGIN
  BEGIN PERFORM * FROM public.embaixadores_resumo('10000000-0000-0000-0000-000000000404', 30); RAISE EXCEPTION 'estranho viu o resumo';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.embaixador_vendas_admin('10000000-0000-0000-0000-000000000407'); RAISE EXCEPTION 'estranho viu as vendas';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
