-- Regressão: só sobe imagem na pasta da entrega com token válido e recente.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000331','entregas@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000331',true);
INSERT INTO public.clientes(id, user_id, nome_especialista, idade, nicho) VALUES
 ('20000000-0000-0000-0000-000000000331','10000000-0000-0000-0000-000000000331','Teste entrega', 30, 'teste');
INSERT INTO public.atividades(id, user_id, cliente_id, titulo, status) VALUES
 ('30000000-0000-0000-0000-000000000331','10000000-0000-0000-0000-000000000331','20000000-0000-0000-0000-000000000331','A','backlog');
INSERT INTO public.entregas_envio(token, atividade_id) VALUES
 ('40000000-0000-0000-0000-000000000331','30000000-0000-0000-0000-000000000331'),
 ('40000000-0000-0000-0000-000000000332','30000000-0000-0000-0000-000000000331');
UPDATE public.entregas_envio SET criado_em = now() - interval '5 hours' WHERE token = '40000000-0000-0000-0000-000000000332';
DO $$
BEGIN
  IF NOT public.entrega_envio_permitido('30000000-0000-0000-0000-000000000331/40000000-0000-0000-0000-000000000331/01.png') THEN
    RAISE EXCEPTION 'token válido recusado'; END IF;
  IF public.entrega_envio_permitido('30000000-0000-0000-0000-000000000331/40000000-0000-0000-0000-000000000332/01.png') THEN
    RAISE EXCEPTION 'token vencido aceito'; END IF;
  IF public.entrega_envio_permitido('30000000-0000-0000-0000-000000000331/40000000-0000-0000-0000-000000000331/x.sh') THEN
    RAISE EXCEPTION 'aceitou arquivo que não é imagem'; END IF;
  IF public.entrega_envio_permitido('30000000-0000-0000-0000-000000000331/99999999-0000-0000-0000-000000000000/01.png') THEN
    RAISE EXCEPTION 'token inventado aceito'; END IF;
END $$;
ROLLBACK;
