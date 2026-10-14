-- Regressão: o Storage só aceita páginas do Roy com o token certo, no
-- carrossel certo e enquanto ele está em produção; o app não lê o token.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000149','roy-envio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000149',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-0000000001f1', 'Envio teste', 30, 'x', auth.uid());
RESET ROLE;
INSERT INTO public.carrosseis(id, cliente_id, tema, fonte_id, status, token_envio)
 VALUES ('10000000-0000-0000-0000-0000000001f2', '10000000-0000-0000-0000-0000000001f1', 'Tema', 'reel-envio', 'produzindo',
         '10000000-0000-0000-0000-0000000001f3');
DO $$
DECLARE base text := '10000000-0000-0000-0000-0000000001f1/10000000-0000-0000-0000-0000000001f2/';
BEGIN
 IF NOT public.carrossel_envio_permitido(base || '10000000-0000-0000-0000-0000000001f3/01.png') THEN
   RAISE EXCEPTION 'token certo foi recusado'; END IF;
 IF public.carrossel_envio_permitido(base || '10000000-0000-0000-0000-0000000001f4/01.png') THEN
   RAISE EXCEPTION 'token errado foi aceito'; END IF;
 IF public.carrossel_envio_permitido(base || 'nao-e-uuid/01.png') THEN RAISE EXCEPTION 'caminho inválido aceito'; END IF;
 IF public.carrossel_envio_permitido(base || '10000000-0000-0000-0000-0000000001f3/x.svg') THEN RAISE EXCEPTION 'arquivo que não é página aceito'; END IF;
 IF NOT public.carrossel_envio_permitido(base || '10000000-0000-0000-0000-0000000001f3/assets/fonte-titulo.ttf') THEN
   RAISE EXCEPTION 'fonte do molde recusada'; END IF;
 IF public.carrossel_envio_permitido(base || '10000000-0000-0000-0000-0000000001f3/assets/x.html') THEN
   RAISE EXCEPTION 'html aceito em assets'; END IF;
 IF public.carrossel_envio_permitido(base || '10000000-0000-0000-0000-0000000001f3/outra/x.png') THEN
   RAISE EXCEPTION 'pasta estranha aceita'; END IF;
 IF public.carrossel_envio_permitido('10000000-0000-0000-0000-0000000001f1/10000000-0000-0000-0000-0000000001f3/01.png') THEN
   RAISE EXCEPTION 'caminho curto aceito'; END IF;
 UPDATE public.carrosseis SET status = 'revisar' WHERE id = '10000000-0000-0000-0000-0000000001f2';
 IF public.carrossel_envio_permitido(base || '10000000-0000-0000-0000-0000000001f3/01.png') THEN
   RAISE EXCEPTION 'aceitou envio fora de produção'; END IF;
END $$;
-- A policy vale pra quem tem só a chave pública (anon).
UPDATE public.carrosseis SET status = 'produzindo' WHERE id = '10000000-0000-0000-0000-0000000001f2';
SET LOCAL ROLE anon;
INSERT INTO storage.objects(bucket_id, name) VALUES
 ('carrosseis', '10000000-0000-0000-0000-0000000001f1/10000000-0000-0000-0000-0000000001f2/10000000-0000-0000-0000-0000000001f3/01.png');
DO $$
BEGIN
 INSERT INTO storage.objects(bucket_id, name) VALUES
  ('carrosseis', '10000000-0000-0000-0000-0000000001f1/10000000-0000-0000-0000-0000000001f2/10000000-0000-0000-0000-0000000001f4/01.png');
 RAISE EXCEPTION 'anon enviou com token errado';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
-- O dono vê o carrossel, mas não o token.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000149',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-0000000001f2') THEN
   RAISE EXCEPTION 'dono não vê o carrossel'; END IF;
 PERFORM modelos FROM public.carrosseis; -- o app lê os moldes da prévia
 BEGIN
   PERFORM token_envio FROM public.carrosseis;
   RAISE EXCEPTION 'app leu o token';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;
