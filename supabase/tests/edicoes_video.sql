-- Regressão: edições do Danilo — dono lê e muda o status; não cria nem mexe
-- em outros campos; outra conta não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000129','edicao-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000128','edicao-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000129',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-0000000001c1', 'Edicao teste', 30, 'x', auth.uid());
-- A edição é criada pelo serviço do Danilo (admin), não pelo app.
RESET ROLE;
INSERT INTO public.edicoes_video(id, cliente_id, titulo, status)
 VALUES ('10000000-0000-0000-0000-0000000001e1', '10000000-0000-0000-0000-0000000001c1', 'Vídeo', 'revisar');
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
 UPDATE public.edicoes_video SET status = 'renderizando' WHERE id = '10000000-0000-0000-0000-0000000001e1';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'dono não mudou o status'; END IF;
 BEGIN
   UPDATE public.edicoes_video SET final_drive = '/x' WHERE id = '10000000-0000-0000-0000-0000000001e1';
   RAISE EXCEPTION 'app mudou campo restrito';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   INSERT INTO public.edicoes_video(cliente_id, titulo) VALUES ('10000000-0000-0000-0000-0000000001c1', 'x');
   RAISE EXCEPTION 'app criou edição';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000128',true);
 IF EXISTS (SELECT 1 FROM public.edicoes_video) THEN RAISE EXCEPTION 'outra conta vê edições alheias'; END IF;
END $$;
ROLLBACK;
