-- Regressão: editor do Danilo pela web — dono lê o projeto e pede versão/aprovar;
-- o pedido herda o cliente da edição; ninguém lê o token; outra conta não pede
-- nem vê; só sobe arquivo com o token certo e nome de prévia/onda.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000229','edweb-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000228','edweb-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000229',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-0000000002c1', 'Edicao web teste', 30, 'x', auth.uid());
RESET ROLE;
INSERT INTO public.edicoes_video(id, cliente_id, titulo, status, projeto, token_envio)
 VALUES ('10000000-0000-0000-0000-0000000002e1', '10000000-0000-0000-0000-0000000002c1', 'Vídeo', 'revisar',
         '{"legendas": []}', '10000000-0000-0000-0000-0000000002f1');
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int; cli uuid; st text;
BEGIN
 IF (SELECT projeto->'legendas' FROM public.edicoes_video WHERE id = '10000000-0000-0000-0000-0000000002e1') IS NULL THEN
   RAISE EXCEPTION 'dono não lê o projeto';
 END IF;
 BEGIN
   PERFORM token_envio FROM public.edicoes_video;
   RAISE EXCEPTION 'app leu o token de envio';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO public.edicoes_pedidos(edicao_id, tipo, projeto)
  VALUES ('10000000-0000-0000-0000-0000000002e1', 'versao', '{"legendas": [1]}');
 INSERT INTO public.edicoes_pedidos(edicao_id, tipo) VALUES ('10000000-0000-0000-0000-0000000002e1', 'aprovar');
 SELECT count(*), min(cliente_id::text)::uuid, min(status) INTO n, cli, st FROM public.edicoes_pedidos;
 IF n <> 2 OR cli <> '10000000-0000-0000-0000-0000000002c1' OR st <> 'na_fila' THEN
   RAISE EXCEPTION 'pedido não herdou o cliente/fila (% % %)', n, cli, st;
 END IF;
 BEGIN
   INSERT INTO public.edicoes_pedidos(edicao_id, tipo) VALUES ('10000000-0000-0000-0000-0000000002e1', 'versao');
   RAISE EXCEPTION 'pedido de versão sem projeto';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
   UPDATE public.edicoes_pedidos SET status = 'feito';
   RAISE EXCEPTION 'app andou com o pedido';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF NOT public.edicao_envio_permitido('10000000-0000-0000-0000-0000000002c1/10000000-0000-0000-0000-0000000002e1/10000000-0000-0000-0000-0000000002f1/previa-v3.mp4')
 THEN RAISE EXCEPTION 'envio com token certo recusado'; END IF;
 IF public.edicao_envio_permitido('10000000-0000-0000-0000-0000000002c1/10000000-0000-0000-0000-0000000002e1/10000000-0000-0000-0000-0000000002f2/previa-v3.mp4')
 THEN RAISE EXCEPTION 'envio com token errado aceito'; END IF;
 IF public.edicao_envio_permitido('10000000-0000-0000-0000-0000000002c1/10000000-0000-0000-0000-0000000002e1/10000000-0000-0000-0000-0000000002f1/qualquer.exe')
 THEN RAISE EXCEPTION 'envio de arquivo estranho aceito'; END IF;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000228',true);
 IF EXISTS (SELECT 1 FROM public.edicoes_pedidos) THEN RAISE EXCEPTION 'outra conta vê pedidos alheios'; END IF;
 BEGIN
   INSERT INTO public.edicoes_pedidos(edicao_id, tipo) VALUES ('10000000-0000-0000-0000-0000000002e1', 'aprovar');
   RAISE EXCEPTION 'outra conta pediu aprovação';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;
