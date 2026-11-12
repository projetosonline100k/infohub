-- Regressão: o dono cria afiliados; o código é único no sistema inteiro e não pode ser trocado; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000391','af-dono@example.com',now()), ('10000000-0000-0000-0000-000000000392','af-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000391',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000393', 'AF', 30, 'x', '10000000-0000-0000-0000-000000000391');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug) VALUES ('10000000-0000-0000-0000-000000000394', '10000000-0000-0000-0000-000000000393', 'Quiz AF', 'quiz-af-teste');
SET LOCAL ROLE authenticated;
INSERT INTO public.quiz_afiliados(quiz_id, cliente_id, nome, codigo, comissao_pct) VALUES ('10000000-0000-0000-0000-000000000394', '10000000-0000-0000-0000-000000000393', 'Maria', 'maria1', 30);
DO $$
BEGIN
  UPDATE public.quiz_afiliados SET comissao_pct = 40, ativo = false;
  IF (SELECT comissao_pct FROM public.quiz_afiliados) <> 40 THEN RAISE EXCEPTION 'não atualizou a comissão'; END IF;
  BEGIN UPDATE public.quiz_afiliados SET codigo = 'outro1'; RAISE EXCEPTION 'trocou o código';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.quiz_afiliados(quiz_id, cliente_id, nome, codigo) VALUES ('10000000-0000-0000-0000-000000000394', '10000000-0000-0000-0000-000000000393', 'Outra Maria', 'maria1'); RAISE EXCEPTION 'código repetido';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public.quiz_afiliados(quiz_id, cliente_id, nome, codigo) VALUES ('10000000-0000-0000-0000-000000000394', '10000000-0000-0000-0000-000000000393', 'X', 'com-hifen'); RAISE EXCEPTION 'aceitou código inválido';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000392',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.quiz_afiliados) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu os afiliados'; END IF; END $$;
RESET ROLE;
ROLLBACK;
