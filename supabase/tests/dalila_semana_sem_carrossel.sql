-- Regressão (20/10): dark às 10h no lugar do carrossel. O carrossel não cai num dia
-- que já tem reel às 10h; reel em outro horário (12h, 18h) não tira o dia dele.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000ec1','sem-carrossel@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000ec1',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000ec2', 'Semana sem carrossel', 30, 'x', auth.uid());
INSERT INTO public.membros(cliente_id, nome, conta_id) VALUES ('10000000-0000-0000-0000-000000000ec2', 'Davi', auth.uid());
INSERT INTO public.membros(cliente_id, nome, funcao, eh_ia) VALUES ('10000000-0000-0000-0000-000000000ec2', 'Dalila', 'Social media', true);
RESET ROLE;
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000ec1', '10000000-0000-0000-0000-000000000ec2', 'sem-car', 'semcar', 'x');
INSERT INTO public.edicoes_video(id, cliente_id, user_id, titulo, status, final_drive, duracao, formato) VALUES
 ('10000000-0000-0000-0000-000000000ec3', '10000000-0000-0000-0000-000000000ec2', '10000000-0000-0000-0000-000000000ec1', 'Dark', 'revisar', '/d.mp4', 30, 'dark');
UPDATE public.edicoes_video SET status = 'aprovado' WHERE id = '10000000-0000-0000-0000-000000000ec3';
UPDATE public.reels SET status = 'pronto', video_url = 'https://x/r.mp4', legenda = 'Legenda do dark'
 WHERE cliente_id = '10000000-0000-0000-0000-000000000ec2';

DO $$
DECLARE
  v_10 timestamptz := (((now() AT TIME ZONE 'America/Sao_Paulo')::date
    + CASE WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time < time '09:50' THEN 0 ELSE 1 END) + time '10:00') AT TIME ZONE 'America/Sao_Paulo';
  v_cli uuid := '10000000-0000-0000-0000-000000000ec2';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.reels WHERE cliente_id = v_cli AND status = 'programado') THEN
    RAISE EXCEPTION 'dark não foi programado'; END IF;
  -- Dark ao meio-dia: o carrossel continua no 1º dia às 10h.
  UPDATE public.reels SET programado_para = v_10 + interval '2 hours' WHERE cliente_id = v_cli;
  IF public.dalila_proximo_horario(v_cli, 'carrossel') <> v_10 THEN RAISE EXCEPTION 'reel das 12h tirou o dia do carrossel'; END IF;
  -- Dark às 10h: o carrossel pula para o dia seguinte.
  UPDATE public.reels SET programado_para = v_10 WHERE cliente_id = v_cli;
  IF public.dalila_proximo_horario(v_cli, 'carrossel') <> v_10 + interval '1 day' THEN
    RAISE EXCEPTION 'carrossel caiu junto do dark das 10h: %', public.dalila_proximo_horario(v_cli, 'carrossel'); END IF;
  -- E o dark das 10h continua contando como o dark do dia.
  IF (public.dalila_proximo_horario(v_cli, 'dark') AT TIME ZONE 'America/Sao_Paulo')::date = (v_10 AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'dois darks automáticos no mesmo dia'; END IF;
END $$;
ROLLBACK;
