-- Regressão: o dono muda o status do lead; não muda o resto da resposta; status inválido é recusado.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000311','qls@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000311',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000313', 'QLS', 30, 'x', '10000000-0000-0000-0000-000000000311');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES ('10000000-0000-0000-0000-000000000314', '10000000-0000-0000-0000-000000000313', 'Q', 'qls-teste-1', 'publicado', '{"perguntas":[{"id":"q1","texto":"a","opcoes":[]}],"perfis":[]}');
INSERT INTO public.quiz_respostas(id, quiz_id, cliente_id, nome) VALUES ('10000000-0000-0000-0000-000000000315', '10000000-0000-0000-0000-000000000314', '10000000-0000-0000-0000-000000000313', 'Ana');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  UPDATE public.quiz_respostas SET status = 'em_contato' WHERE id = '10000000-0000-0000-0000-000000000315';
  IF (SELECT status FROM public.quiz_respostas WHERE id = '10000000-0000-0000-0000-000000000315') <> 'em_contato' THEN RAISE EXCEPTION 'não mudou o status'; END IF;
  BEGIN
    UPDATE public.quiz_respostas SET nome = 'Outro' WHERE id = '10000000-0000-0000-0000-000000000315';
    RAISE EXCEPTION 'editou o nome do lead';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.quiz_respostas SET status = 'xyz' WHERE id = '10000000-0000-0000-0000-000000000315';
    RAISE EXCEPTION 'aceitou status inválido';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
