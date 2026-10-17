-- Regressão (17/10): aprovar o carrossel ou o reel ficar pronto = a Dalila
-- programa sozinha no 1º dia livre do ritmo (carrossel 10h, reel 18h, cada um
-- contado à parte), com a tarefa do Davi já concluída (a nuvem reabre se falhar);
-- projeto sem Instagram continua com "Escolher data"; falhou e voltou não
-- reprograma sozinho; o Davi muda dia e legenda depois.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000d71','sozinha-dono@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000d71',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000d72', 'Sozinha com Insta', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000d73', 'Sozinha sem Insta', 30, 'x', auth.uid());
INSERT INTO public.membros(cliente_id, nome, conta_id) VALUES
 ('10000000-0000-0000-0000-000000000d72', 'Davi', auth.uid()), ('10000000-0000-0000-0000-000000000d73', 'Davi', auth.uid());
INSERT INTO public.membros(cliente_id, nome, funcao, eh_ia) VALUES
 ('10000000-0000-0000-0000-000000000d72', 'Dalila', 'Social media', true), ('10000000-0000-0000-0000-000000000d73', 'Dalila', 'Social media', true);
RESET ROLE;
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000d71', '10000000-0000-0000-0000-000000000d72', 'soz-p', 'sozinha', 'x');
INSERT INTO public.carrosseis(id, cliente_id, user_id, numero, tema, fonte_id, status, paginas, legenda) VALUES
 ('10000000-0000-0000-0000-000000000d74', '10000000-0000-0000-0000-000000000d72', '10000000-0000-0000-0000-000000000d71', 901, 'Um', 'soz-1', 'revisar', ARRAY['a.png'], 'Legenda 1'),
 ('10000000-0000-0000-0000-000000000d75', '10000000-0000-0000-0000-000000000d72', '10000000-0000-0000-0000-000000000d71', 902, 'Dois', 'soz-2', 'revisar', ARRAY['a.png'], 'Legenda 2'),
 ('10000000-0000-0000-0000-000000000d76', '10000000-0000-0000-0000-000000000d73', '10000000-0000-0000-0000-000000000d71', 903, 'Sem', 'soz-3', 'revisar', ARRAY['a.png'], 'Legenda 3');
INSERT INTO public.edicoes_video(id, cliente_id, user_id, titulo, status, final_drive, duracao) VALUES
 ('10000000-0000-0000-0000-000000000d77', '10000000-0000-0000-0000-000000000d72', '10000000-0000-0000-0000-000000000d71', 'Reel A', 'revisar', '/a.mp4', 30),
 ('10000000-0000-0000-0000-000000000d78', '10000000-0000-0000-0000-000000000d72', '10000000-0000-0000-0000-000000000d71', 'Reel B', 'revisar', '/b.mp4', 30),
 ('10000000-0000-0000-0000-000000000d79', '10000000-0000-0000-0000-000000000d73', '10000000-0000-0000-0000-000000000d71', 'Reel C', 'revisar', '/c.mp4', 30);

-- Aprovar os carrosséis (como o app) e os reels ficarem prontos (como o Mac).
UPDATE public.carrosseis SET status = 'aprovado' WHERE id IN
 ('10000000-0000-0000-0000-000000000d74', '10000000-0000-0000-0000-000000000d75', '10000000-0000-0000-0000-000000000d76');
UPDATE public.edicoes_video SET status = 'aprovado' WHERE id IN
 ('10000000-0000-0000-0000-000000000d77', '10000000-0000-0000-0000-000000000d78', '10000000-0000-0000-0000-000000000d79');
UPDATE public.reels SET status = 'pronto', video_url = 'https://x/r.mp4', legenda = 'Legenda do reel'
 WHERE edicao_id IN ('10000000-0000-0000-0000-000000000d77', '10000000-0000-0000-0000-000000000d78', '10000000-0000-0000-0000-000000000d79');

DO $$
DECLARE
  c1 public.carrosseis; c2 public.carrosseis; c3 public.carrosseis;
  r1 public.reels; r2 public.reels; r3 public.reels;
  t public.atividades;
  v_10 timestamptz := public.dalila_proximo_horario('10000000-0000-0000-0000-000000000d73', 'carrossel');
BEGIN
  SELECT * INTO c1 FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000d74';
  SELECT * INTO c2 FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000d75';
  SELECT * INTO c3 FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000d76';
  -- Carrossel: programado sozinho, às 10h, um por dia, dias seguidos.
  IF c1.status <> 'programado' OR c2.status <> 'programado' OR c1.programado_pela_dalila_em IS NULL THEN
    RAISE EXCEPTION 'carrossel não programou sozinho: % / %', c1.status, c2.status; END IF;
  IF to_char(c1.programado_para AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') <> '10:00' THEN RAISE EXCEPTION 'carrossel fora das 10h'; END IF;
  -- (a ordem entre os dois do mesmo UPDATE não é garantida)
  IF least(c1.programado_para, c2.programado_para) <> v_10 THEN RAISE EXCEPTION 'não pegou o 1º dia livre'; END IF;
  IF abs(extract(epoch FROM c2.programado_para - c1.programado_para)) <> 86400 THEN RAISE EXCEPTION 'segundo carrossel não foi pro dia seguinte'; END IF;
  SELECT * INTO t FROM public.atividades WHERE id = c1.tarefa_data_id;
  IF t.id IS NULL OR NOT t.concluida OR t.tipo <> 'agendar' OR t.titulo NOT LIKE 'A Dalila programou o carrossel:%' THEN
    RAISE EXCEPTION 'aviso do Davi errado: %', t.titulo; END IF;
  IF NOT (SELECT concluida FROM public.atividades WHERE id = c1.atividade_id) THEN RAISE EXCEPTION 'tarefa da Dalila não concluiu'; END IF;
  -- Sem Instagram: caminho antigo.
  IF c3.status <> 'aprovado' OR c3.programado_para IS NOT NULL THEN RAISE EXCEPTION 'programou sem Instagram'; END IF;
  IF (SELECT titulo FROM public.atividades WHERE id = c3.tarefa_data_id) NOT LIKE 'Escolher data do carrossel:%' THEN
    RAISE EXCEPTION 'sem Instagram não pediu a data'; END IF;

  SELECT * INTO r1 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000d77';
  SELECT * INTO r2 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000d78';
  SELECT * INTO r3 FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000d79';
  -- Reel: às 18h, um por dia; o carrossel não ocupa o dia do reel.
  IF r1.status <> 'programado' OR r2.status <> 'programado' THEN RAISE EXCEPTION 'reel não programou sozinho'; END IF;
  IF to_char(r1.programado_para AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') <> '18:00' THEN RAISE EXCEPTION 'reel fora das 18h'; END IF;
  IF abs(extract(epoch FROM r2.programado_para - r1.programado_para)) <> 86400 THEN RAISE EXCEPTION 'reels no mesmo dia'; END IF;
  IF (r1.programado_para AT TIME ZONE 'America/Sao_Paulo')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1 THEN
    RAISE EXCEPTION 'carrossel tomou o dia do reel'; END IF;
  SELECT * INTO t FROM public.atividades WHERE id = r1.tarefa_data_id;
  IF NOT t.concluida OR t.tipo <> 'agendar_reel' OR t.titulo <> 'A Dalila programou o reel: Reel A' THEN RAISE EXCEPTION 'aviso do reel errado'; END IF;
  IF r3.status <> 'pronto' OR (SELECT titulo FROM public.atividades WHERE id = r3.tarefa_data_id) <> 'Escolher data do reel: Reel C' THEN
    RAISE EXCEPTION 'reel sem Instagram não pediu a data'; END IF;
END $$;

-- A nuvem não conseguiu publicar: volta (como a edge) e não reprograma sozinha.
UPDATE public.carrosseis SET status = 'aprovado', programado_para = NULL, mensagem = 'Não publicou: x' WHERE id = '10000000-0000-0000-0000-000000000d74';
UPDATE public.reels SET status = 'pronto', programado_para = NULL, mensagem = 'Não publicou: x' WHERE edicao_id = '10000000-0000-0000-0000-000000000d77';
DO $$ BEGIN
  IF (SELECT status FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000d74') <> 'aprovado' THEN RAISE EXCEPTION 'carrossel reprogramou depois de falhar'; END IF;
  IF (SELECT status FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000d77') <> 'pronto' THEN RAISE EXCEPTION 'reel reprogramou depois de falhar'; END IF;
  IF public.dalila_programar_reel_sozinha((SELECT id FROM public.reels WHERE edicao_id = '10000000-0000-0000-0000-000000000d77')) THEN
    RAISE EXCEPTION 'programou duas vezes sozinha'; END IF;
END $$;

-- O Davi muda o dia e a legenda do carrossel programado.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000d71',true);
SET LOCAL ROLE authenticated;
SELECT public.programar_carrossel('10000000-0000-0000-0000-000000000d75', now() + interval '20 days', 'Legenda nova');
DO $$ BEGIN
  IF (SELECT legenda FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000d75') <> 'Legenda nova' THEN RAISE EXCEPTION 'legenda não mudou'; END IF;
END $$;
SELECT public.programar_carrossel('10000000-0000-0000-0000-000000000d75', now() + interval '21 days');
DO $$ BEGIN
  IF (SELECT legenda FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000d75') <> 'Legenda nova' THEN RAISE EXCEPTION 'sem legenda apagou a legenda'; END IF;
  BEGIN
    PERFORM public.programar_carrossel('10000000-0000-0000-0000-000000000d75', now() + interval '22 days', '  ');
    RAISE EXCEPTION 'aceitou legenda vazia';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'aceitou legenda vazia' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- O que só a Dalila usa fica fechado para o app.
DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.dalila_programar_reel_sozinha(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dalila_programar_carrossel_sozinha(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dalila_proximo_horario(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'app consegue chamar a programação sozinha'; END IF;
END $$;
ROLLBACK;
