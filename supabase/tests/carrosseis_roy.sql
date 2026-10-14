-- Regressão: carrosséis do Roy — dono lê, aprova, pede ajuste e corrige o
-- texto; não cria carrossel, não troca as páginas nem a fonte, não cria
-- estilo; a mesma fonte não vira dois carrosséis; outra conta não vê nada.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000139','roy-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000138','roy-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000139',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-0000000001d1', 'Roy teste', 30, 'x', auth.uid());
-- Estilo e carrossel são criados pelo Roy (admin), não pelo app.
RESET ROLE;
INSERT INTO public.estilos_carrossel(id, cliente_id, nome, parametros)
 VALUES ('10000000-0000-0000-0000-0000000001d2', '10000000-0000-0000-0000-0000000001d1', 'Clássico marfim', '{"largura":1080}');
INSERT INTO public.carrosseis(id, cliente_id, estilo_id, tema, fonte_id, status, paginas)
 VALUES ('10000000-0000-0000-0000-0000000001d3', '10000000-0000-0000-0000-0000000001d1',
         '10000000-0000-0000-0000-0000000001d2', 'Tema', 'reel-1', 'revisar', ARRAY['https://x/01.png']);
DO $$
BEGIN
 INSERT INTO public.carrosseis(cliente_id, tema, fonte_id) VALUES ('10000000-0000-0000-0000-0000000001d1', 'Outro', 'reel-1');
 RAISE EXCEPTION 'a mesma fonte virou dois carrosséis';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
 IF (SELECT count(*) FROM public.estilos_carrossel) <> 1 THEN RAISE EXCEPTION 'dono não vê o estilo'; END IF;
 PERFORM atividade_roy_id FROM public.carrosseis; -- o app lê a tarefa de origem (pra concluir ao aprovar)
 BEGIN
   UPDATE public.carrosseis SET atividade_roy_id = NULL WHERE id = '10000000-0000-0000-0000-0000000001d3';
   RAISE EXCEPTION 'app trocou a tarefa de origem';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 UPDATE public.carrosseis SET status = 'ajuste', feedback = 'Trocar a capa',
   slides = '[{"titulo":"X","texto":"Y","pagina":"01/06"}]', legenda = 'nova'
  WHERE id = '10000000-0000-0000-0000-0000000001d3';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'dono não pediu ajuste'; END IF;
 -- Aprovar com páginas excluídas: vai como ajuste marcado pra aprovar depois.
 UPDATE public.carrosseis SET status = 'ajuste', aprovar_apos_ajuste = true WHERE id = '10000000-0000-0000-0000-0000000001d3';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'dono não marcou aprovar depois do ajuste'; END IF;
 IF NOT (SELECT aprovar_apos_ajuste FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-0000000001d3') THEN
   RAISE EXCEPTION 'dono não lê aprovar_apos_ajuste'; END IF;
 UPDATE public.carrosseis SET status = 'aprovado', revisado_em = now() WHERE id = '10000000-0000-0000-0000-0000000001d3';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'dono não aprovou'; END IF;
 BEGIN
   UPDATE public.carrosseis SET paginas = ARRAY['https://outro'] WHERE id = '10000000-0000-0000-0000-0000000001d3';
   RAISE EXCEPTION 'app trocou as páginas';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   UPDATE public.carrosseis SET fonte_id = 'reel-2' WHERE id = '10000000-0000-0000-0000-0000000001d3';
   RAISE EXCEPTION 'app trocou a fonte';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.carrosseis(cliente_id, tema, fonte_id) VALUES ('10000000-0000-0000-0000-0000000001d1', 'x', 'reel-3');
   RAISE EXCEPTION 'app criou carrossel';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.estilos_carrossel(cliente_id, nome) VALUES ('10000000-0000-0000-0000-0000000001d1', 'x');
   RAISE EXCEPTION 'app criou estilo';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000138',true);
 IF EXISTS (SELECT 1 FROM public.carrosseis) THEN RAISE EXCEPTION 'outra conta vê carrosséis alheios'; END IF;
 IF EXISTS (SELECT 1 FROM public.estilos_carrossel) THEN RAISE EXCEPTION 'outra conta vê estilos alheios'; END IF;
 UPDATE public.carrosseis SET status = 'aprovado' WHERE id = '10000000-0000-0000-0000-0000000001d3';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'outra conta aprovou carrossel alheio'; END IF;
END $$;
ROLLBACK;
