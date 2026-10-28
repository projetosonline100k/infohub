-- Regressão (28/10): capa do reel. O dono troca o quadro (zera o container da
-- Meta e marca capa_pelo_davi); quem não é da equipe não troca; reel publicado não muda.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-00000000ca01','capa-dono@example.com',now()),
 ('10000000-0000-0000-0000-00000000ca02','capa-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000ca01',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-00000000ca03', 'Capa', 30, 'x', auth.uid());
RESET ROLE;
SELECT set_config('dalila.programar_sozinha', 'off', true);
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-00000000ca01', '10000000-0000-0000-0000-00000000ca03', 'capa-p', 'capa', 'x');
INSERT INTO public.edicoes_video(id, cliente_id, user_id, titulo, status, final_drive, duracao) VALUES
 ('10000000-0000-0000-0000-00000000ca04', '10000000-0000-0000-0000-00000000ca03', '10000000-0000-0000-0000-00000000ca01', 'Capa A', 'revisar', '/a.mp4', 30);
UPDATE public.edicoes_video SET status = 'aprovado' WHERE id = '10000000-0000-0000-0000-00000000ca04';
UPDATE public.reels SET status = 'programado', video_url = 'https://x/r.mp4', legenda = 'L', duracao = 30,
  capa_ms = 4500, capa_sugestoes = ARRAY[4500, 12500], ig_container_id = 'c1', ig_container_em = now()
 WHERE edicao_id = '10000000-0000-0000-0000-00000000ca04';

DO $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-00000000ca04';
  IF r.id IS NULL THEN RAISE EXCEPTION 'reel não nasceu da edição'; END IF;
  PERFORM set_config('capa.reel', r.id::text, true);
END $$;

-- Outra conta não troca.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000ca02',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.escolher_capa_reel(current_setting('capa.reel')::uuid, 12500);
  RAISE EXCEPTION 'outra conta trocou a capa';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- O dono troca; fora do vídeo não aceita.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000ca01',true);
SET LOCAL ROLE authenticated;
SELECT public.escolher_capa_reel(current_setting('capa.reel')::uuid, 12500);
DO $$
BEGIN
  PERFORM public.escolher_capa_reel(current_setting('capa.reel')::uuid, 40000);
  RAISE EXCEPTION 'aceitou quadro fora do vídeo';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%fora do vídeo%' THEN RAISE; END IF;
END $$;
RESET ROLE;
DO $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE id = current_setting('capa.reel')::uuid;
  IF r.capa_ms <> 12500 OR NOT r.capa_pelo_davi OR r.ig_container_id IS NOT NULL THEN
    RAISE EXCEPTION 'troca errada: % % %', r.capa_ms, r.capa_pelo_davi, r.ig_container_id; END IF;
END $$;

-- Publicado não muda.
UPDATE public.reels SET status = 'publicado', ig_media_id = 'm1' WHERE id = current_setting('capa.reel')::uuid;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.escolher_capa_reel(current_setting('capa.reel')::uuid, 4500);
  RAISE EXCEPTION 'mudou a capa de reel publicado';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%não pode mudar%' THEN RAISE; END IF;
END $$;
RESET ROLE;
ROLLBACK;
