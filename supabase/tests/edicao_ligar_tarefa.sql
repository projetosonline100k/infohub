-- Regressão: ligar edição à tarefa liga uma vez só, e quem não tem acesso não liga.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000321','ed-ligar@example.com',now()),
 ('10000000-0000-0000-0000-000000000322','ed-ligar-outro@example.com',now());
-- O dono carimbado no projeto vem do usuário logado (team_stamp_owner): loga antes de inserir.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000321',true);
INSERT INTO public.clientes(id, user_id, nome_especialista, idade, nicho) VALUES
 ('20000000-0000-0000-0000-000000000321','10000000-0000-0000-0000-000000000321','Teste edição', 30, 'teste');
INSERT INTO public.atividades(id, user_id, cliente_id, titulo, status) VALUES
 ('30000000-0000-0000-0000-000000000321','10000000-0000-0000-0000-000000000321','20000000-0000-0000-0000-000000000321','A','backlog'),
 ('30000000-0000-0000-0000-000000000322','10000000-0000-0000-0000-000000000321','20000000-0000-0000-0000-000000000321','B','backlog');
INSERT INTO public.edicoes_video(id, user_id, cliente_id, titulo, status) VALUES
 ('40000000-0000-0000-0000-000000000321','10000000-0000-0000-0000-000000000321','20000000-0000-0000-0000-000000000321','Bruto x','revisar');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000322',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.edicao_ligar_tarefa('40000000-0000-0000-0000-000000000321','30000000-0000-0000-0000-000000000321');
    RAISE EXCEPTION 'outro usuário ligou';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000321',true);
DO $$
BEGIN
  IF public.edicao_ligar_tarefa('40000000-0000-0000-0000-000000000321','30000000-0000-0000-0000-000000000321') <> '30000000-0000-0000-0000-000000000321' THEN
    RAISE EXCEPTION 'não ligou'; END IF;
  IF public.edicao_ligar_tarefa('40000000-0000-0000-0000-000000000321','30000000-0000-0000-0000-000000000322') <> '30000000-0000-0000-0000-000000000321' THEN
    RAISE EXCEPTION 'trocou a tarefa já ligada'; END IF;
END $$;
ROLLBACK;
