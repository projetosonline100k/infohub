-- Regressão: Short no YouTube junto do reel. Sem canal do projeto não
-- programa o Short; título obrigatório, até 100 caracteres, sem < >; desmarcar
-- tira o Short; o app não lê tokens nem a sessão de envio; só o service_role
-- pega a fila; o link do YouTube e o do Instagram ficam juntos na tarefa.
BEGIN;
-- Caminho manual ("Escolher data"); a programação sozinha (17/10) tem teste próprio: dalila_programa_sozinha.sql.
SELECT set_config('dalila.programar_sozinha', 'off', true);
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000b71','yt-dono@example.com',now()),
 ('10000000-0000-0000-0000-000000000b72','yt-alheio@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000b71',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000b73', 'Short com canal', 30, 'x', auth.uid());
INSERT INTO public.membros(cliente_id, nome, conta_id) VALUES ('10000000-0000-0000-0000-000000000b73', 'Davi', auth.uid());
INSERT INTO public.membros(cliente_id, nome, funcao, eh_ia) VALUES ('10000000-0000-0000-0000-000000000b73', 'Dalila', 'Social media', true);
RESET ROLE;
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000b71', '10000000-0000-0000-0000-000000000b73', 'yt-ig', 'do_projeto', 'x');
INSERT INTO public.edicoes_video(id, cliente_id, user_id, titulo, status, final_drive, duracao) VALUES
 ('10000000-0000-0000-0000-000000000b75', '10000000-0000-0000-0000-000000000b73', '10000000-0000-0000-0000-000000000b71',
  '3 hábitos', 'revisar', '/drive/final.mp4', 60);
UPDATE public.edicoes_video SET status = 'aprovado' WHERE id = '10000000-0000-0000-0000-000000000b75';
UPDATE public.reels SET status = 'pronto', video_url = 'https://x/reel.mp4', video_caminho = 'a/b/c/reel-v1.mp4', legenda = 'Legenda'
WHERE edicao_id = '10000000-0000-0000-0000-000000000b75';

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000b71',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_id uuid := (SELECT id FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000b75');
BEGIN
 IF public.youtube_do_projeto('10000000-0000-0000-0000-000000000b73') IS NOT NULL THEN RAISE EXCEPTION 'canal fantasma'; END IF;
 BEGIN PERFORM public.programar_reel(v_id, now() + interval '1 day', 'L', true, 'Título'); RAISE EXCEPTION 'programou Short sem canal';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Este projeto não tem canal%' THEN RAISE; END IF; END;
 -- Sem marcar o YouTube, segue igual ao reel de antes (3 argumentos).
 PERFORM public.programar_reel(v_id, now() + interval '1 day', 'L');
 IF (SELECT yt_status FROM public.reels WHERE id = v_id) IS NOT NULL THEN RAISE EXCEPTION 'Short sem pedido'; END IF;
 BEGIN PERFORM refresh_token_encrypted FROM public.youtube_conexoes; RAISE EXCEPTION 'app leu o token do YouTube';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;
INSERT INTO public.youtube_conexoes(cliente_id, user_id, canal_id, canal_titulo, access_token_encrypted, refresh_token_encrypted, token_expira_em)
VALUES ('10000000-0000-0000-0000-000000000b73', '10000000-0000-0000-0000-000000000b71', 'UCx', 'Canal do Davi', 'a', 'b', now());

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000b71',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_id uuid := (SELECT id FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000b75');
BEGIN
 IF public.youtube_do_projeto('10000000-0000-0000-0000-000000000b73') IS DISTINCT FROM 'Canal do Davi' THEN RAISE EXCEPTION 'não viu o canal'; END IF;
 BEGIN PERFORM public.programar_reel(v_id, now() + interval '1 day', 'L', true, '  '); RAISE EXCEPTION 'Short sem título';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Short sem título' THEN RAISE; END IF; END;
 BEGIN PERFORM public.programar_reel(v_id, now() + interval '1 day', 'L', true, repeat('a', 101)); RAISE EXCEPTION 'título longo';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'título longo' THEN RAISE; END IF; END;
 BEGIN PERFORM public.programar_reel(v_id, now() + interval '1 day', 'L', true, 'a <b>'); RAISE EXCEPTION 'título com <>';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'título com <>' THEN RAISE; END IF; END;
 PERFORM public.programar_reel(v_id, now() + interval '1 day', 'L', true, ' 3 hábitos ');
 IF (SELECT yt_status || '|' || yt_titulo || '|' || (yt_programado_para = programado_para)::text FROM public.reels WHERE id = v_id)
    <> 'programado|3 hábitos|true' THEN RAISE EXCEPTION 'Short não programou'; END IF;
 BEGIN PERFORM yt_sessao FROM public.reels; RAISE EXCEPTION 'app leu a sessão de envio';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.dalila_proximo_short(); RAISE EXCEPTION 'app pegou a fila do YouTube';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.desprogramar_reel(v_id);
 IF (SELECT yt_status FROM public.reels WHERE id = v_id) IS NOT NULL THEN RAISE EXCEPTION 'desmarcar deixou o Short'; END IF;
 PERFORM public.programar_reel(v_id, now() + interval '3 minutes', 'L', true, '3 hábitos');
END $$;

-- Quem não é da equipe não vê o canal.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000b72',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.youtube_do_projeto('10000000-0000-0000-0000-000000000b73') IS NOT NULL THEN RAISE EXCEPTION 'alheio viu o canal'; END IF;
END $$;

-- A nuvem só pega o Short na hora, uma vez por trava; o link vai para a tarefa.
RESET ROLE;
UPDATE public.reels SET yt_programado_para = now() - interval '1 minute' WHERE edicao_id = '10000000-0000-0000-0000-000000000b75';
SET LOCAL ROLE service_role;
DO $$
DECLARE v_id uuid := (SELECT id FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000b75');
BEGIN
 UPDATE public.reels SET yt_trava_ate = now() + interval '1 hour' WHERE id <> v_id AND yt_status IS NOT NULL;
 IF (SELECT count(*) FROM public.dalila_proximo_short()) <> 1 THEN RAISE EXCEPTION 'não pegou o Short'; END IF;
 IF (SELECT count(*) FROM public.dalila_proximo_short()) <> 0 THEN RAISE EXCEPTION 'pegou o Short duas vezes'; END IF;
 UPDATE public.reels SET permalink = 'https://instagram.com/p/x', yt_status = 'publicado', yt_video_id = 'abc',
   yt_url = 'https://youtube.com/shorts/abc', yt_privacidade = 'private' WHERE id = v_id;
 PERFORM public.reel_links_na_tarefa(v_id);
 IF (SELECT observacao FROM public.atividades WHERE id = (SELECT atividade_id FROM public.reels WHERE id = v_id))
    <> E'Instagram: https://instagram.com/p/x\nYouTube: https://youtube.com/shorts/abc (saiu private)' THEN
   RAISE EXCEPTION 'links errados na tarefa'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
