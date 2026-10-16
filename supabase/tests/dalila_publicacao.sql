-- Regressão: aprovar um carrossel cria a tarefa da Dalila e a "Escolher data"
-- do Davi; só quem edita o carrossel programa; a fila da nuvem é só do
-- service_role e pega um carrossel por vez.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000161','dalila-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000162','dalila-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000161',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000163', 'Dalila teste', 30, 'x', auth.uid());
INSERT INTO public.membros(id, cliente_id, nome, conta_id) VALUES
 ('10000000-0000-0000-0000-000000000164', '10000000-0000-0000-0000-000000000163', 'Davi', auth.uid());
INSERT INTO public.membros(id, cliente_id, nome, funcao, eh_ia) VALUES
 ('10000000-0000-0000-0000-000000000165', '10000000-0000-0000-0000-000000000163', 'Dalila', 'Social media', true);
RESET ROLE;
-- O projeto tem o Instagram dele (regra de 15/10: sem isso a Dalila não programa).
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000161', '10000000-0000-0000-0000-000000000163', 'ig-teste', 'teste', 'x');
INSERT INTO public.carrosseis(id, cliente_id, user_id, numero, tema, fonte_id, status, paginas, legenda)
 VALUES ('10000000-0000-0000-0000-000000000166', '10000000-0000-0000-0000-000000000163',
         '10000000-0000-0000-0000-000000000161', 12, 'Tema', 'reel-dalila', 'revisar', ARRAY['a.png','b.png'], 'Legenda');

-- A Dalila real virou IA.
DO $$ BEGIN
 IF NOT (SELECT eh_ia FROM public.membros WHERE id = 'a0492db7-8a2d-49fb-97a1-628cc7cf106e') THEN
   RAISE EXCEPTION 'Dalila não virou IA'; END IF;
END $$;

-- O Davi aprova pelo app (sem criar a tarefa: a Dalila é IA).
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000161',true);
SET LOCAL ROLE authenticated;
UPDATE public.carrosseis SET status = 'aprovado' WHERE id = '10000000-0000-0000-0000-000000000166';
DO $$
DECLARE c record; t record;
BEGIN
 SELECT atividade_id, tarefa_data_id, programado_para FROM public.carrosseis
   WHERE id = '10000000-0000-0000-0000-000000000166' INTO c;
 IF c.atividade_id IS NULL OR c.tarefa_data_id IS NULL THEN RAISE EXCEPTION 'tarefas não nasceram: %', c; END IF;
 SELECT * INTO t FROM public.atividades WHERE id = c.atividade_id;
 IF t.responsavel_id <> '10000000-0000-0000-0000-000000000165' OR t.tipo <> 'programacao' OR t.situacao <> 'fila'
    OR t.titulo <> 'Programar carrossel: 012 · Tema (2 páginas)' THEN RAISE EXCEPTION 'tarefa da Dalila errada: %', t.titulo; END IF;
 SELECT * INTO t FROM public.atividades WHERE id = c.tarefa_data_id;
 IF t.responsavel_id <> '10000000-0000-0000-0000-000000000164' OR t.tipo <> 'agendar' OR t.concluida
    OR t.user_id <> '10000000-0000-0000-0000-000000000161' THEN RAISE EXCEPTION 'tarefa do Davi errada'; END IF;

 BEGIN
   PERFORM public.programar_carrossel('10000000-0000-0000-0000-000000000166', now() - interval '1 hour');
   RAISE EXCEPTION 'programou no passado';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM = 'programou no passado' THEN RAISE; END IF;
 END;
 PERFORM public.programar_carrossel('10000000-0000-0000-0000-000000000166', now() + interval '1 day');
 IF (SELECT status FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000166') <> 'programado' THEN
   RAISE EXCEPTION 'não ficou programado'; END IF;
 IF NOT (SELECT concluida FROM public.atividades WHERE id = c.tarefa_data_id) THEN RAISE EXCEPTION 'tarefa do Davi aberta'; END IF;
 IF (SELECT situacao FROM public.atividades WHERE id = c.atividade_id) <> 'concluida' THEN RAISE EXCEPTION 'Dalila não concluiu ao programar'; END IF;

 -- O app não chama a fila da nuvem nem lê a chave.
 BEGIN
   PERFORM public.dalila_proximo_carrossel();
   RAISE EXCEPTION 'app pegou a fila da Dalila';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.dalila_chave_ok('x');
   RAISE EXCEPTION 'app conferiu a chave';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM public.desprogramar_carrossel('10000000-0000-0000-0000-000000000166');
 IF (SELECT concluida FROM public.atividades WHERE id = c.tarefa_data_id) THEN RAISE EXCEPTION 'tarefa do Davi não reabriu'; END IF;
 PERFORM public.programar_carrossel('10000000-0000-0000-0000-000000000166', now() + interval '1 day');
END $$;

-- Quem não é da equipe não programa.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000162',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
   PERFORM public.desprogramar_carrossel('10000000-0000-0000-0000-000000000166');
   RAISE EXCEPTION 'alheio mexeu na programação';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

-- A nuvem pega o carrossel (falta o JPEG) uma vez só enquanto a trava vale.
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 UPDATE public.carrosseis SET publicacao_trava_ate = now() + interval '1 hour'
   WHERE status IN ('programado', 'publicando') AND id <> '10000000-0000-0000-0000-000000000166';
 IF (SELECT count(*) FROM public.dalila_proximo_carrossel()) <> 1 THEN RAISE EXCEPTION 'não pegou o carrossel'; END IF;
 IF (SELECT count(*) FROM public.dalila_proximo_carrossel()) <> 0 THEN RAISE EXCEPTION 'pegou duas vezes'; END IF;
 IF public.dalila_chave_ok('errada') OR public.dalila_chave_ok(NULL) THEN RAISE EXCEPTION 'chave errada aceita'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
