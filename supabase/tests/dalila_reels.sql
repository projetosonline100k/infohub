-- Regressão: edição aprovada vira reel + tarefa da Dalila; pronto vira
-- "Escolher data do reel" do Davi; só quem edita programa (com legenda e
-- horário futuro); projeto sem Instagram não programa; o Storage só aceita o
-- vídeo com o token certo enquanto prepara; a fila da nuvem é do service_role.
BEGIN;
-- Caminho manual ("Escolher data"); a programação sozinha (17/10) tem teste próprio: dalila_programa_sozinha.sql.
SELECT set_config('dalila.programar_sozinha', 'off', true);
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000a61','reel-dono@example.com',now()),
 ('10000000-0000-0000-0000-000000000a62','reel-alheio@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000a61',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000a63', 'Reel com Insta', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000a64', 'Reel sem Insta', 30, 'x', auth.uid());
INSERT INTO public.membros(cliente_id, nome, conta_id) VALUES
 ('10000000-0000-0000-0000-000000000a63', 'Davi', auth.uid()), ('10000000-0000-0000-0000-000000000a64', 'Davi', auth.uid());
INSERT INTO public.membros(cliente_id, nome, funcao, eh_ia) VALUES
 ('10000000-0000-0000-0000-000000000a63', 'Dalila', 'Social media', true), ('10000000-0000-0000-0000-000000000a64', 'Dalila', 'Social media', true);
RESET ROLE;
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000a61', '10000000-0000-0000-0000-000000000a63', 'reel-p', 'do_projeto', 'x');
INSERT INTO public.edicoes_video(id, cliente_id, user_id, titulo, status, final_drive, duracao) VALUES
 ('10000000-0000-0000-0000-000000000a65', '10000000-0000-0000-0000-000000000a63', '10000000-0000-0000-0000-000000000a61',
  'Piloto — 3 ideias (IMG_1234)', 'revisar', '/drive/final.mp4', 60),
 ('10000000-0000-0000-0000-000000000a66', '10000000-0000-0000-0000-000000000a64', '10000000-0000-0000-0000-000000000a61',
  'Outro', 'revisar', '/drive/outro.mp4', 60);

-- O piloto real já entrou na fila.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.reels WHERE edicao_id = '30d92e0f-3044-4315-9a5d-303f08ef63b9' AND atividade_id IS NOT NULL) THEN
   RAISE EXCEPTION 'piloto aprovado não virou reel'; END IF;
END $$;

-- Aprovar a edição (Danilo/servidor) cria o reel e a tarefa da Dalila.
UPDATE public.edicoes_video SET status = 'aprovado' WHERE id IN ('10000000-0000-0000-0000-000000000a65', '10000000-0000-0000-0000-000000000a66');
DO $$
DECLARE r public.reels; t public.atividades;
BEGIN
 SELECT * INTO r FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000a65';
 IF r.id IS NULL OR r.status <> 'preparando' OR r.titulo <> '3 ideias' OR r.token_envio IS NULL OR r.tarefa_data_id IS NOT NULL THEN
   RAISE EXCEPTION 'reel errado: % / %', r.status, r.titulo; END IF;
 SELECT * INTO t FROM public.atividades WHERE id = r.atividade_id;
 IF t.titulo <> 'Programar reel: 3 ideias' OR t.tipo <> 'programacao' OR t.situacao <> 'fila' THEN RAISE EXCEPTION 'tarefa da Dalila errada'; END IF;
 -- Aprovar de novo não duplica.
 PERFORM public.reel_da_edicao('10000000-0000-0000-0000-000000000a65');
 IF (SELECT count(*) FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000a65') <> 1 THEN RAISE EXCEPTION 'duplicou'; END IF;
 -- Storage: só com o token certo e enquanto prepara.
 IF NOT public.reel_envio_permitido(r.cliente_id || '/' || r.id || '/' || r.token_envio || '/reel-v1.mp4') THEN RAISE EXCEPTION 'token certo recusado'; END IF;
 IF public.reel_envio_permitido(r.cliente_id || '/' || r.id || '/' || gen_random_uuid() || '/reel-v1.mp4') THEN RAISE EXCEPTION 'token errado aceito'; END IF;
 IF public.reel_envio_permitido(r.cliente_id || '/' || r.id || '/' || r.token_envio || '/x.mov') THEN RAISE EXCEPTION 'arquivo estranho aceito'; END IF;
 -- O Mac (admin) entrega: vídeo + legenda → pronto → tarefa do Davi.
 UPDATE public.reels SET status = 'pronto', video_url = 'https://x/reel.mp4', legenda = 'Legenda' WHERE id = r.id;
 SELECT * INTO r FROM public.reels WHERE id = r.id;
 IF r.tarefa_data_id IS NULL THEN RAISE EXCEPTION 'tarefa do Davi não nasceu'; END IF;
 SELECT * INTO t FROM public.atividades WHERE id = r.tarefa_data_id;
 IF t.tipo <> 'agendar_reel' OR t.titulo <> 'Escolher data do reel: 3 ideias' OR t.prioridade <> 'alta' THEN RAISE EXCEPTION 'tarefa do Davi errada'; END IF;
 IF public.reel_envio_permitido(r.cliente_id || '/' || r.id || '/' || r.token_envio || '/reel-v1.mp4') THEN RAISE EXCEPTION 'aceitou envio depois de pronto'; END IF;
 UPDATE public.reels SET status = 'pronto', video_url = 'https://x/outro.mp4', legenda = 'L' WHERE edicao_id = '10000000-0000-0000-0000-000000000a66';
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000a61',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_id uuid := (SELECT id FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000a65');
BEGIN
 BEGIN PERFORM token_envio FROM public.reels; RAISE EXCEPTION 'app leu o token';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.programar_reel(v_id, now() + interval '1 day', '  '); RAISE EXCEPTION 'programou sem legenda';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'programou sem legenda' THEN RAISE; END IF; END;
 BEGIN PERFORM public.programar_reel(v_id, now() - interval '1 hour', 'L'); RAISE EXCEPTION 'programou no passado';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'programou no passado' THEN RAISE; END IF; END;
 PERFORM public.programar_reel(v_id, now() + interval '1 day', 'Legenda nova');
 IF (SELECT status || '|' || legenda FROM public.reels WHERE id = v_id) <> 'programado|Legenda nova' THEN RAISE EXCEPTION 'não programou'; END IF;
 IF NOT (SELECT concluida FROM public.atividades WHERE id = (SELECT tarefa_data_id FROM public.reels WHERE id = v_id)) THEN RAISE EXCEPTION 'tarefa do Davi aberta'; END IF;
 IF NOT (SELECT concluida FROM public.atividades WHERE id = (SELECT atividade_id FROM public.reels WHERE id = v_id)) THEN RAISE EXCEPTION 'tarefa da Dalila aberta'; END IF;
 PERFORM public.desprogramar_reel(v_id);
 IF (SELECT status FROM public.reels WHERE id = v_id) <> 'pronto' THEN RAISE EXCEPTION 'não desprogramou'; END IF;
 -- Projeto sem Instagram: a regra única barra.
 BEGIN
   PERFORM public.programar_reel((SELECT id FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000a66'), now() + interval '1 day', 'L');
   RAISE EXCEPTION 'programou sem Instagram';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Este projeto não tem Instagram%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.dalila_proximo_reel(); RAISE EXCEPTION 'app pegou a fila';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.programar_reel(v_id, now() + interval '3 minutes', 'Legenda nova');
END $$;

-- Quem não é da equipe não mexe.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000a62',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000a65') THEN RAISE EXCEPTION 'alheio viu o reel'; END IF;
 BEGIN PERFORM public.cancelar_reel((SELECT id FROM public.reels LIMIT 1)); EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL; END;
END $$;

-- A nuvem só pega o reel na hora.
RESET ROLE;
UPDATE public.reels SET programado_para = now() - interval '1 minute' WHERE edicao_id = '10000000-0000-0000-0000-000000000a65';
SET LOCAL ROLE service_role;
DO $$ BEGIN
 UPDATE public.reels SET publicacao_trava_ate = now() + interval '1 hour' WHERE edicao_id <> '10000000-0000-0000-0000-000000000a65';
 IF (SELECT count(*) FROM public.dalila_proximo_reel()) <> 1 THEN RAISE EXCEPTION 'não pegou o reel'; END IF;
 IF (SELECT count(*) FROM public.dalila_proximo_reel()) <> 0 THEN RAISE EXCEPTION 'pegou duas vezes'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
