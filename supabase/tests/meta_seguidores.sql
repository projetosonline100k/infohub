-- Regressão: meta de seguidores do projeto grava meta/prazo/largada e não aceita meta zero ou negativa.
-- (Quem pode mexer no projeto continua sendo as policies de clientes, que não mudaram.)
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000301','meta-seg@example.com',now());
INSERT INTO public.clientes(id, user_id, nome_especialista, idade, nicho) VALUES
 ('20000000-0000-0000-0000-000000000301','10000000-0000-0000-0000-000000000301','Teste meta', 30, 'teste');
UPDATE public.clientes SET meta_seguidores = 100000, meta_seguidores_prazo = '2027-06-30', meta_seguidores_desde = current_date
 WHERE id = '20000000-0000-0000-0000-000000000301';
DO $$
BEGIN
  IF (SELECT meta_seguidores FROM public.clientes WHERE id = '20000000-0000-0000-0000-000000000301') IS DISTINCT FROM 100000 THEN
    RAISE EXCEPTION 'não gravou a meta'; END IF;
  BEGIN
    UPDATE public.clientes SET meta_seguidores = 0 WHERE id = '20000000-0000-0000-0000-000000000301';
    RAISE EXCEPTION 'aceitou meta zero';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
