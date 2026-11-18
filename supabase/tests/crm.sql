-- Regressão do CRM por projeto: etapas padrão em todo projeto novo; quiz, abordagem e compra viram a mesma pessoa e avançam de etapa;
-- compra soma valor; cada dono só enxerga o CRM dos seus projetos.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000c01','crm1@example.com',now()),('10000000-0000-0000-0000-000000000c02','crm2@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000c01',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000c11', 'CRM1', 30, 'x', '10000000-0000-0000-0000-000000000c01');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000c02',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000c12', 'CRM2', 30, 'x', '10000000-0000-0000-0000-000000000c02');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000c01',true);
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES ('10000000-0000-0000-0000-000000000c21', '10000000-0000-0000-0000-000000000c11', 'Q', 'crm-q', 'publicado', '{"perguntas":[{"id":"q1","texto":"v1","opcoes":[]}],"perfis":[]}');
INSERT INTO public.produtos_cliente(id, cliente_id, nome_produto, user_id) VALUES ('10000000-0000-0000-0000-000000000c31', '10000000-0000-0000-0000-000000000c11', 'P', '10000000-0000-0000-0000-000000000c01');
DO $$
DECLARE pid uuid; r uuid;
BEGIN
  IF (SELECT count(*) FROM public.crm_etapas WHERE cliente_id = '10000000-0000-0000-0000-000000000c11') <> 7 THEN RAISE EXCEPTION 'projeto novo sem as 7 etapas padrão'; END IF;
  PERFORM public.responder_quiz('crm-q', '[]', 'p', 'Ana', 'ana@x.co', '(11) 98888-7777');
  IF (SELECT count(*) FROM public.crm_pessoas WHERE cliente_id = '10000000-0000-0000-0000-000000000c11') <> 1 THEN RAISE EXCEPTION 'lead do quiz não virou pessoa'; END IF;
  SELECT p.id INTO pid FROM public.crm_pessoas p WHERE cliente_id = '10000000-0000-0000-0000-000000000c11';
  IF (SELECT e.chave FROM public.crm_pessoas p JOIN public.crm_etapas e ON e.id = p.etapa_id WHERE p.id = pid) <> 'novo' THEN RAISE EXCEPTION 'não entrou em Novo'; END IF;
  -- o mesmo telefone em outro formato e outro e-mail é a mesma pessoa
  PERFORM public.responder_quiz('crm-q', '[]', 'p', 'Ana S', 'outro@x.co', '5511988887777');
  IF (SELECT count(*) FROM public.crm_pessoas WHERE cliente_id = '10000000-0000-0000-0000-000000000c11') <> 1 THEN RAISE EXCEPTION 'duplicou a pessoa'; END IF;
  SELECT id INTO r FROM public.quiz_respostas WHERE nome = 'Ana';
  INSERT INTO public.quiz_abordagens(quiz_id, resposta_id, cliente_id, texto, canal) VALUES ('10000000-0000-0000-0000-000000000c21', r, '10000000-0000-0000-0000-000000000c11', 'oi', 'whatsapp');
  IF (SELECT e.chave FROM public.crm_pessoas p JOIN public.crm_etapas e ON e.id = p.etapa_id WHERE p.id = pid) <> 'abordado' THEN RAISE EXCEPTION 'abordagem não levou a Abordado'; END IF;
  INSERT INTO public.vendas_plataforma_eventos(produto_id, plataforma, transacao_id, tipo, valor, data, comprador_nome, comprador_email)
    VALUES ('10000000-0000-0000-0000-000000000c31', 'kiwify', 'crm-t1', 'venda', 97, current_date, 'Ana', 'ANA@x.co');
  IF (SELECT e.chave FROM public.crm_pessoas p JOIN public.crm_etapas e ON e.id = p.etapa_id WHERE p.id = pid) <> 'vendido' THEN RAISE EXCEPTION 'compra não levou a Vendido'; END IF;
  IF (SELECT valor_vendido FROM public.crm_pessoas WHERE id = pid) <> 97 THEN RAISE EXCEPTION 'valor não somou'; END IF;
  IF (SELECT count(*) FROM public.crm_pessoas WHERE cliente_id = '10000000-0000-0000-0000-000000000c11') <> 1 THEN RAISE EXCEPTION 'compra duplicou a pessoa'; END IF;
  -- nunca volta de etapa sozinho
  INSERT INTO public.quiz_abordagens(quiz_id, resposta_id, cliente_id, texto, canal) VALUES ('10000000-0000-0000-0000-000000000c21', r, '10000000-0000-0000-0000-000000000c11', 'oi 2', 'whatsapp');
  IF (SELECT e.chave FROM public.crm_pessoas p JOIN public.crm_etapas e ON e.id = p.etapa_id WHERE p.id = pid) <> 'vendido' THEN RAISE EXCEPTION 'voltou de etapa'; END IF;
  IF (SELECT count(*) FROM public.crm_eventos WHERE pessoa_id = pid) < 4 THEN RAISE EXCEPTION 'linha do tempo curta'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.crm_pessoas) <> 1 THEN RAISE EXCEPTION 'dono não vê a própria pessoa'; END IF;
  INSERT INTO public.crm_pessoas(cliente_id, nome, telefone) VALUES ('10000000-0000-0000-0000-000000000c11', 'Manual', '11977776666');
  IF (SELECT count(*) FROM public.crm_pessoas) <> 2 THEN RAISE EXCEPTION 'dono não cadastrou pessoa'; END IF;
  BEGIN
    INSERT INTO public.crm_pessoas(cliente_id, nome) VALUES ('10000000-0000-0000-0000-000000000c12', 'Invasor');
    RAISE EXCEPTION 'cadastrou no projeto de outro dono';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000c02',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.crm_pessoas) <> 0 OR (SELECT count(*) FROM public.crm_eventos) <> 0 THEN RAISE EXCEPTION 'outro dono vê o CRM alheio'; END IF; END $$;
RESET ROLE;
ROLLBACK;
