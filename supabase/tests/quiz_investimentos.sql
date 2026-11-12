-- Regressão: o dono guarda o investimento por origem (uma linha por origem, sem repetir); valor negativo é recusado; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000361','qi-dono@example.com',now()), ('10000000-0000-0000-0000-000000000362','qi-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000361',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000363', 'QI', 30, 'x', '10000000-0000-0000-0000-000000000361');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES ('10000000-0000-0000-0000-000000000364', '10000000-0000-0000-0000-000000000363', 'Q', 'qi-teste-1', 'revisar', '{"perguntas":[],"perfis":[]}');
SET LOCAL ROLE authenticated;
INSERT INTO public.quiz_investimentos(quiz_id, cliente_id, chave, valor) VALUES ('10000000-0000-0000-0000-000000000364', '10000000-0000-0000-0000-000000000363', 'instagram|reels|manychat', 150);
DO $$
BEGIN
  INSERT INTO public.quiz_investimentos(quiz_id, cliente_id, chave, valor) VALUES ('10000000-0000-0000-0000-000000000364', '10000000-0000-0000-0000-000000000363', 'instagram|reels|manychat', 200)
    ON CONFLICT (quiz_id, chave) DO UPDATE SET valor = EXCLUDED.valor;
  IF (SELECT count(*) FROM public.quiz_investimentos) <> 1 OR (SELECT valor FROM public.quiz_investimentos) <> 200 THEN RAISE EXCEPTION 'não atualizou a mesma origem'; END IF;
  BEGIN INSERT INTO public.quiz_investimentos(quiz_id, cliente_id, chave, valor) VALUES ('10000000-0000-0000-0000-000000000364', '10000000-0000-0000-0000-000000000363', 'x', -5); RAISE EXCEPTION 'aceitou negativo';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000362',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.quiz_investimentos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu'; END IF; END $$;
RESET ROLE;
ROLLBACK;
