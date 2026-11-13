-- Regressão: fluxos de mensagem do Instagram. O dono cria e edita o fluxo da própria conta; não mexe no contador de disparos;
-- outra pessoa não vê nem cria fluxo em conta alheia; a execução é só leitura para o app; a fila de esperas só entrega o que venceu.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000461','fl-dono@example.com',now()), ('10000000-0000-0000-0000-000000000462','fl-outro@example.com',now());
INSERT INTO public.instagram_conexoes(ig_user_id, user_id, username, access_token) VALUES ('900461', '10000000-0000-0000-0000-000000000461', 'conta_fluxo', 'segredo');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000461',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.instagram_fluxos(id, user_id, ig_user_id, nome, palavras_chave) VALUES ('10000000-0000-0000-0000-000000000463', '10000000-0000-0000-0000-000000000461', '900461', 'Boas-vindas', ARRAY['quero']);
DO $$
BEGIN
  UPDATE public.instagram_fluxos SET ativo = true, nome = 'Boas-vindas 2' WHERE id = '10000000-0000-0000-0000-000000000463';
  IF (SELECT jsonb_array_length(grafo->'nos') FROM public.instagram_fluxos) <> 1 THEN RAISE EXCEPTION 'grafo inicial errado'; END IF;
  BEGIN UPDATE public.instagram_fluxos SET disparos = 99; RAISE EXCEPTION 'dono mexeu nos disparos';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.instagram_fluxos SET grafo = '{"nos":"x","ligacoes":[]}'::jsonb; RAISE EXCEPTION 'grafo inválido aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.instagram_fluxos(user_id, ig_user_id, nome, gatilhos) VALUES ('10000000-0000-0000-0000-000000000461', '900461', 'X', ARRAY['invalido']); RAISE EXCEPTION 'gatilho inválido aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.instagram_fluxo_execucoes(fluxo_id, user_id, ig_user_id, contato_id) VALUES ('10000000-0000-0000-0000-000000000463', '10000000-0000-0000-0000-000000000461', '900461', 'c1'); RAISE EXCEPTION 'app escreveu execução';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Execuções criadas pelo robô: só uma ativa por pessoa e fluxo; a fila entrega só a espera vencida.
INSERT INTO public.instagram_fluxo_execucoes(fluxo_id, user_id, ig_user_id, contato_id, estado, proximo_em)
VALUES ('10000000-0000-0000-0000-000000000463', '10000000-0000-0000-0000-000000000461', '900461', 'c1', 'aguardando_tempo', now() - interval '1 minute'),
       ('10000000-0000-0000-0000-000000000463', '10000000-0000-0000-0000-000000000461', '900461', 'c2', 'aguardando_tempo', now() + interval '1 hour');
DO $$
BEGIN
  BEGIN INSERT INTO public.instagram_fluxo_execucoes(fluxo_id, user_id, ig_user_id, contato_id, estado) VALUES ('10000000-0000-0000-0000-000000000463', '10000000-0000-0000-0000-000000000461', '900461', 'c1', 'rodando'); RAISE EXCEPTION 'duas execuções ativas da mesma pessoa';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF (SELECT count(*) FROM public.fluxo_proximas_execucoes(10) f WHERE f.fluxo_id = '10000000-0000-0000-0000-000000000463') <> 1 THEN RAISE EXCEPTION 'fila deveria entregar só a espera vencida'; END IF;
  IF (SELECT count(*) FROM public.fluxo_proximas_execucoes(10) f WHERE f.fluxo_id = '10000000-0000-0000-0000-000000000463') <> 0 THEN RAISE EXCEPTION 'fila entregou duas vezes (trava)'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000462',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.instagram_fluxos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu o fluxo'; END IF;
  IF (SELECT count(*) FROM public.instagram_fluxo_execucoes) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu as execuções'; END IF;
  BEGIN INSERT INTO public.instagram_fluxos(user_id, ig_user_id, nome) VALUES ('10000000-0000-0000-0000-000000000462', '900461', 'invasão'); RAISE EXCEPTION 'fluxo em conta alheia';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
