-- Regressão: Instagram do perfil dark. O dono programa o vídeo pronto (RPC) só com Instagram conectado, vídeo e data futura; o app não lê o token de envio nem as contas dos outros;
-- a fila do Lauro só pega o que está programado e vencido; o envio do vídeo só vale com o token certo e enquanto 'programando'.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000441','ig-dono@example.com',now()), ('10000000-0000-0000-0000-000000000442','ig-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000441',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.esteira_dark_perfis(id, nome) VALUES ('10000000-0000-0000-0000-000000000443', 'Perfil IG');
INSERT INTO public.esteira_dark_roteiros(id, perfil_id, titulo, texto) VALUES ('10000000-0000-0000-0000-000000000444', '10000000-0000-0000-0000-000000000443', 'Vídeo', 'roteiro');
UPDATE public.esteira_dark_roteiros SET status = 'programando' WHERE id = '10000000-0000-0000-0000-000000000444';
RESET ROLE;
UPDATE public.esteira_dark_roteiros SET video_url = 'https://x.co/v.mp4' WHERE id = '10000000-0000-0000-0000-000000000444';
SET LOCAL ROLE authenticated;
DO $$
DECLARE tok uuid;
BEGIN
  BEGIN PERFORM public.programar_roteiro_dark('10000000-0000-0000-0000-000000000444', now() + interval '1 day', 'legenda'); RAISE EXCEPTION 'programou sem Instagram';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Conecte o Instagram%' THEN RAISE; END IF; END;
  BEGIN PERFORM token_envio FROM public.esteira_dark_roteiros; RAISE EXCEPTION 'app leu o token de envio';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.instagram_conexoes(ig_user_id, user_id, username, access_token, perfil_dark_id)
VALUES ('900441', '10000000-0000-0000-0000-000000000441', 'perfil_ig', 'segredo', '10000000-0000-0000-0000-000000000443');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.dark_instagram_do_perfil('10000000-0000-0000-0000-000000000443')) <> 1 THEN RAISE EXCEPTION 'dono não vê o Instagram do perfil'; END IF;
  BEGIN PERFORM public.programar_roteiro_dark('10000000-0000-0000-0000-000000000444', now() - interval '1 hour', 'legenda'); RAISE EXCEPTION 'data no passado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Escolha um horário%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.programar_roteiro_dark('10000000-0000-0000-0000-000000000444', now() + interval '1 day', '  '); RAISE EXCEPTION 'sem legenda';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Escreva a legenda%' THEN RAISE; END IF; END;
  PERFORM public.programar_roteiro_dark('10000000-0000-0000-0000-000000000444', now() + interval '1 day', 'Minha legenda');
  IF (SELECT status FROM public.esteira_dark_roteiros WHERE id = '10000000-0000-0000-0000-000000000444') <> 'programado' THEN RAISE EXCEPTION 'não programou'; END IF;
  BEGIN PERFORM public.dark_desconectar_instagram('10000000-0000-0000-0000-000000000443'); RAISE EXCEPTION 'desconectou com vídeo programado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Há vídeo programado%' THEN RAISE; END IF; END;
  PERFORM public.desprogramar_roteiro_dark('10000000-0000-0000-0000-000000000444');
  IF (SELECT status FROM public.esteira_dark_roteiros WHERE id = '10000000-0000-0000-0000-000000000444') <> 'programando' THEN RAISE EXCEPTION 'não desprogramou'; END IF;
END $$;
RESET ROLE;
-- Fila do Lauro: só programado e vencido, uma vez por vez (a trava segura).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.lauro_proximo_roteiro() f WHERE f.id = '10000000-0000-0000-0000-000000000444') <> 0 THEN RAISE EXCEPTION 'fila pegou vídeo não programado'; END IF;
  UPDATE public.esteira_dark_roteiros SET status = 'programado', programado_para = now() - interval '1 minute' WHERE id = '10000000-0000-0000-0000-000000000444';
  IF (SELECT count(*) FROM public.lauro_proximo_roteiro() f WHERE f.id = '10000000-0000-0000-0000-000000000444') <> 1 THEN RAISE EXCEPTION 'fila não pegou o vencido'; END IF;
  IF (SELECT count(*) FROM public.lauro_proximo_roteiro() f WHERE f.id = '10000000-0000-0000-0000-000000000444') <> 0 THEN RAISE EXCEPTION 'fila pegou o mesmo duas vezes (trava)'; END IF;
  UPDATE public.esteira_dark_roteiros SET status = 'programando', programado_para = NULL WHERE id = '10000000-0000-0000-0000-000000000444';
  IF NOT public.dark_envio_permitido('10000000-0000-0000-0000-000000000443/10000000-0000-0000-0000-000000000444/' || (SELECT token_envio FROM public.esteira_dark_roteiros WHERE id = '10000000-0000-0000-0000-000000000444') || '/reel-v1.mp4') THEN RAISE EXCEPTION 'envio com o token certo foi recusado'; END IF;
  IF public.dark_envio_permitido('10000000-0000-0000-0000-000000000443/10000000-0000-0000-0000-000000000444/10000000-0000-0000-0000-000000000999/reel-v1.mp4') THEN RAISE EXCEPTION 'envio com token errado foi aceito'; END IF;
  IF public.dark_envio_permitido('10000000-0000-0000-0000-000000000443/10000000-0000-0000-0000-000000000444/x/reel-v1.mp4') THEN RAISE EXCEPTION 'caminho inválido aceito'; END IF;
END $$;
-- Outra pessoa não vê a conta nem programa.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000442',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.dark_instagram_do_perfil('10000000-0000-0000-0000-000000000443')) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu o Instagram'; END IF;
  BEGIN PERFORM public.programar_roteiro_dark('10000000-0000-0000-0000-000000000444', now() + interval '1 day', 'x'); RAISE EXCEPTION 'outra pessoa programou';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.dark_desconectar_instagram('10000000-0000-0000-0000-000000000443'); RAISE EXCEPTION 'outra pessoa desconectou';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Programação automática (aprovou = ok): hora padrão 18h de Brasília, dia marcado se ainda der tempo, senão o 1º dia livre; só 'programando' com vídeo pronto e Instagram conectado.
DO $$
DECLARE r1 timestamptz; r2 timestamptz;
BEGIN
  UPDATE public.esteira_dark_roteiros SET status = 'programando', video_url = 'https://x.co/v.mp4', legenda = NULL, titulo = 'Meu título,', data_postagem = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 3
    WHERE id = '10000000-0000-0000-0000-000000000444';
  r1 := public.lauro_programar_auto('10000000-0000-0000-0000-000000000444');
  IF r1 IS NULL OR (r1 AT TIME ZONE 'America/Sao_Paulo')::time <> time '18:00' OR (r1 AT TIME ZONE 'America/Sao_Paulo')::date <> (now() AT TIME ZONE 'America/Sao_Paulo')::date + 3 THEN RAISE EXCEPTION 'não programou às 18h do dia marcado: %', r1; END IF;
  IF (SELECT legenda FROM public.esteira_dark_roteiros WHERE id = '10000000-0000-0000-0000-000000000444') <> 'Meu título' THEN RAISE EXCEPTION 'legenda deveria ser o título sem a vírgula final'; END IF;
  IF (SELECT status FROM public.esteira_dark_roteiros WHERE id = '10000000-0000-0000-0000-000000000444') <> 'programado' THEN RAISE EXCEPTION 'status deveria ser programado'; END IF;
  IF public.lauro_programar_auto('10000000-0000-0000-0000-000000000444') IS NOT NULL THEN RAISE EXCEPTION 'programou duas vezes'; END IF;
  -- segundo vídeo sem dia, no mesmo perfil: vai para o 1º dia livre (não o ocupado)
  INSERT INTO public.esteira_dark_roteiros(id, perfil_id, user_id, titulo, texto, status, video_url) VALUES ('10000000-0000-0000-0000-000000000445', '10000000-0000-0000-0000-000000000443', '10000000-0000-0000-0000-000000000441', 'Outro', 'texto', 'programando', 'https://x.co/v2.mp4');
  r2 := public.lauro_programar_auto('10000000-0000-0000-0000-000000000445');
  IF r2 IS NULL OR (r2 AT TIME ZONE 'America/Sao_Paulo')::date = (r1 AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'caiu no dia já ocupado'; END IF;
  IF r2 < now() + interval '5 minutes' THEN RAISE EXCEPTION 'horário no passado'; END IF;
  DELETE FROM public.instagram_conexoes WHERE perfil_dark_id = '10000000-0000-0000-0000-000000000443';
  UPDATE public.esteira_dark_roteiros SET status = 'programando', programado_para = NULL WHERE id = '10000000-0000-0000-0000-000000000445';
  IF public.lauro_programar_auto('10000000-0000-0000-0000-000000000445') IS NOT NULL THEN RAISE EXCEPTION 'programou sem Instagram conectado'; END IF;
END $$;
ROLLBACK;
