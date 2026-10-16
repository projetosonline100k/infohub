-- Regressão: carrossel de projeto sem Instagram próprio não pode ser programado
-- (a conexão geral da conta só vale pro projeto Davi Queiroz).
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000891','dig-test@example.com',now());
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000892', 'Sem Insta', 30, 'x', '10000000-0000-0000-0000-000000000891'),
 ('10000000-0000-0000-0000-000000000893', 'Com Insta', 30, 'x', '10000000-0000-0000-0000-000000000891');
-- Conexão geral da conta (sem projeto) + a do projeto "Com Insta".
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token)
VALUES ('10000000-0000-0000-0000-000000000891', NULL, 'g1', 'conta_geral', 'x'),
       ('10000000-0000-0000-0000-000000000891', '10000000-0000-0000-0000-000000000893', 'p1', 'projeto', 'x');
INSERT INTO public.carrosseis(id, cliente_id, user_id, numero, tema, fonte_id, status, paginas, legenda) VALUES
 ('10000000-0000-0000-0000-000000000894', '10000000-0000-0000-0000-000000000892', '10000000-0000-0000-0000-000000000891', 1, 'A', 'reel-a', 'aprovado', ARRAY['a.png'], 'L'),
 ('10000000-0000-0000-0000-000000000895', '10000000-0000-0000-0000-000000000893', '10000000-0000-0000-0000-000000000891', 2, 'B', 'reel-b', 'aprovado', ARRAY['b.png'], 'L');
DO $$
BEGIN
  UPDATE public.carrosseis SET status = 'programado', programado_para = now() + interval '1 day' WHERE id = '10000000-0000-0000-0000-000000000894';
  RAISE EXCEPTION 'programou sem Instagram do projeto';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Este projeto não tem Instagram conectado%' THEN RAISE; END IF;
END $$;
UPDATE public.carrosseis SET status = 'programado', programado_para = now() + interval '1 day' WHERE id = '10000000-0000-0000-0000-000000000895';
DO $$
BEGIN
  IF (SELECT status FROM public.carrosseis WHERE id = '10000000-0000-0000-0000-000000000895') <> 'programado' THEN RAISE EXCEPTION 'não programou com Instagram do projeto'; END IF;
END $$;
ROLLBACK;
