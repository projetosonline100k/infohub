-- Regressão (19/10): reel dark do Danilo pronto = a Dalila programa sozinha às
-- 12h, no 1º dia sem dark; o reel normal continua às 18h, e um não toma o dia do outro.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000da1','dark-dono@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000da1',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000da2', 'Dark com Insta', 30, 'x', auth.uid());
INSERT INTO public.membros(cliente_id, nome, conta_id) VALUES ('10000000-0000-0000-0000-000000000da2', 'Davi', auth.uid());
INSERT INTO public.membros(cliente_id, nome, funcao, eh_ia) VALUES ('10000000-0000-0000-0000-000000000da2', 'Dalila', 'Social media', true);
RESET ROLE;
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000da1', '10000000-0000-0000-0000-000000000da2', 'dark-p', 'dark', 'x');
INSERT INTO public.edicoes_video(id, cliente_id, user_id, titulo, status, final_drive, duracao, formato) VALUES
 ('10000000-0000-0000-0000-000000000da3', '10000000-0000-0000-0000-000000000da2', '10000000-0000-0000-0000-000000000da1', 'Normal A', 'revisar', '/a.mp4', 30, 'classico'),
 ('10000000-0000-0000-0000-000000000da4', '10000000-0000-0000-0000-000000000da2', '10000000-0000-0000-0000-000000000da1', 'Normal B', 'revisar', '/b.mp4', 30, NULL),
 ('10000000-0000-0000-0000-000000000da5', '10000000-0000-0000-0000-000000000da2', '10000000-0000-0000-0000-000000000da1', 'Dark A', 'revisar', '/c.mp4', 30, 'dark'),
 ('10000000-0000-0000-0000-000000000da6', '10000000-0000-0000-0000-000000000da2', '10000000-0000-0000-0000-000000000da1', 'Dark B', 'revisar', '/d.mp4', 30, 'dark');
UPDATE public.edicoes_video SET status = 'aprovado' WHERE cliente_id = '10000000-0000-0000-0000-000000000da2';
UPDATE public.reels SET status = 'pronto', video_url = 'https://x/r.mp4', legenda = 'Legenda do reel'
 WHERE cliente_id = '10000000-0000-0000-0000-000000000da2';

DO $$
DECLARE
  n1 public.reels; n2 public.reels; d1 public.reels; d2 public.reels;
  v_12 timestamptz := (((now() AT TIME ZONE 'America/Sao_Paulo')::date
    + CASE WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time < time '11:50' THEN 0 ELSE 1 END) + time '12:00') AT TIME ZONE 'America/Sao_Paulo';
  t public.atividades;
BEGIN
  SELECT * INTO n1 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000da3';
  SELECT * INTO n2 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000da4';
  SELECT * INTO d1 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000da5';
  SELECT * INTO d2 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000da6';
  IF n1.status <> 'programado' OR n2.status <> 'programado' OR d1.status <> 'programado' OR d2.status <> 'programado' THEN
    RAISE EXCEPTION 'não programou sozinha: % % % %', n1.status, n2.status, d1.status, d2.status; END IF;
  -- Normais às 18h, darks às 12h.
  IF to_char(n1.programado_para AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') <> '18:00'
     OR to_char(n2.programado_para AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') <> '18:00' THEN RAISE EXCEPTION 'reel normal fora das 18h'; END IF;
  IF to_char(d1.programado_para AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') <> '12:00'
     OR to_char(d2.programado_para AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') <> '12:00' THEN RAISE EXCEPTION 'dark fora das 12h'; END IF;
  -- Um dark por dia, a partir do 1º meio-dia livre: os normais não tomam o dia do dark.
  IF least(d1.programado_para, d2.programado_para) <> v_12 THEN RAISE EXCEPTION 'dark não pegou o 1º dia livre'; END IF;
  IF abs(extract(epoch FROM d2.programado_para - d1.programado_para)) <> 86400 THEN RAISE EXCEPTION 'dois darks no mesmo dia'; END IF;
  -- E os darks não tomam o dia do normal.
  IF abs(extract(epoch FROM n2.programado_para - n1.programado_para)) <> 86400 THEN RAISE EXCEPTION 'dois normais no mesmo dia'; END IF;
  IF (least(n1.programado_para, n2.programado_para) AT TIME ZONE 'America/Sao_Paulo')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1 THEN
    RAISE EXCEPTION 'dark tomou o dia do reel normal'; END IF;
  SELECT * INTO t FROM public.atividades WHERE id = d1.tarefa_data_id;
  IF NOT t.concluida OR t.tipo <> 'agendar_reel' OR t.titulo <> 'A Dalila programou o vídeo dark: Dark A' THEN RAISE EXCEPTION 'aviso do dark errado: %', t.titulo; END IF;
  SELECT * INTO t FROM public.atividades WHERE id = n1.tarefa_data_id;
  IF t.titulo <> 'A Dalila programou o reel: Normal A' THEN RAISE EXCEPTION 'aviso do reel normal mudou: %', t.titulo; END IF;
END $$;

DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.reel_eh_dark(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'app consegue chamar reel_eh_dark'; END IF;
END $$;
ROLLBACK;
