-- Regressão (22/10, Instalivros): "Bruto 01-4-livros-…" vira "4 livros …" no reel;
-- reel pronto num projeto sem Instagram espera "Escolher data" e, quando o projeto
-- conecta o Instagram, a Dalila programa sozinha às 18h e a tarefa do Davi sai.
BEGIN;
DO $$ BEGIN
  IF public.reel_titulo_limpo('Bruto 01-4-livros-perigosos-para-manipular') <> '4 livros perigosos para manipular' THEN
    RAISE EXCEPTION 'não limpou o Bruto 01-'; END IF;
  IF public.reel_titulo_limpo('Bruto 02-livros-que-nunca-podem-cair') <> 'Livros que nunca podem cair' THEN
    RAISE EXCEPTION 'não limpou o Bruto 02-'; END IF;
  IF public.reel_titulo_limpo('Bruto IMG_2030') <> 'Bruto IMG_2030' THEN RAISE EXCEPTION 'mexeu no genérico'; END IF;
  IF public.reel_titulo_limpo('Piloto — 4 hábitos diários (IMG_2030)') <> '4 hábitos diários' THEN RAISE EXCEPTION 'perdeu a regra antiga'; END IF;
END $$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000e71','titulo-dono@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000e71',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000e72', 'Conecta depois', 30, 'x', auth.uid());
INSERT INTO public.membros(cliente_id, nome, conta_id) VALUES ('10000000-0000-0000-0000-000000000e72', 'Davi', auth.uid());
INSERT INTO public.membros(cliente_id, nome, funcao, eh_ia) VALUES ('10000000-0000-0000-0000-000000000e72', 'Dalila', 'Social media', true);
RESET ROLE;
INSERT INTO public.edicoes_video(id, cliente_id, user_id, titulo, status, final_drive, duracao) VALUES
 ('10000000-0000-0000-0000-000000000e73', '10000000-0000-0000-0000-000000000e72', '10000000-0000-0000-0000-000000000e71',
  'Bruto 01-4-livros-perigosos-para-manipular', 'revisar', '/a.mp4', 30);
UPDATE public.edicoes_video SET status = 'aprovado' WHERE id = '10000000-0000-0000-0000-000000000e73';
UPDATE public.reels SET status = 'pronto', video_url = 'https://x/r.mp4', legenda = 'Legenda do reel'
 WHERE edicao_id = '10000000-0000-0000-0000-000000000e73';
DO $$
DECLARE r public.reels;
BEGIN
  SELECT * INTO r FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000e73';
  IF r.titulo <> '4 livros perigosos para manipular' THEN RAISE EXCEPTION 'título do reel: %', r.titulo; END IF;
  IF (SELECT titulo FROM public.atividades WHERE id = r.atividade_id) <> 'Programar reel: 4 livros perigosos para manipular' THEN
    RAISE EXCEPTION 'título da tarefa da Dalila sujo'; END IF;
  IF r.status <> 'pronto' OR r.programado_para IS NOT NULL OR r.tarefa_data_id IS NULL THEN
    RAISE EXCEPTION 'sem Instagram não devia programar'; END IF;
END $$;
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000e71', '10000000-0000-0000-0000-000000000e72', 'tit-p', 'conecta_depois', 'x');
DO $$
DECLARE r public.reels; v_antes uuid;
BEGIN
  SELECT * INTO r FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000e73';
  IF r.status <> 'programado' OR r.programado_pela_dalila_em IS NULL THEN RAISE EXCEPTION 'não programou ao conectar: %', r.status; END IF;
  IF to_char(r.programado_para AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') <> '18:00' THEN RAISE EXCEPTION 'reel fora das 18h'; END IF;
  IF (SELECT count(*) FROM public.atividades WHERE cliente_id = '10000000-0000-0000-0000-000000000e72'
       AND titulo LIKE 'Escolher data do reel:%' AND deleted_at IS NULL) <> 0 THEN
    RAISE EXCEPTION '"Escolher data" ficou aberta'; END IF;
  IF NOT (SELECT concluida FROM public.atividades WHERE id = r.tarefa_data_id) THEN RAISE EXCEPTION 'aviso do Davi não concluído'; END IF;
END $$;
ROLLBACK;
