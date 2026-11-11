-- Regressão: o dono cria o link curto; resolver (de fora) devolve o destino e conta o clique; código repetido e destino
-- que não é http(s) são recusados; outra pessoa não vê nem cria no projeto alheio; cliques não se editam.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000331','lc-dono@example.com',now()), ('10000000-0000-0000-0000-000000000332','lc-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000331',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000333', 'LC', 30, 'x', '10000000-0000-0000-0000-000000000331');
SET LOCAL ROLE authenticated;
INSERT INTO public.links_curtos(codigo, destino, cliente_id) VALUES ('bio-ig', 'https://infopro-hub.vercel.app/quiz/abc?utm_source=ig', '10000000-0000-0000-0000-000000000333');
DO $$
BEGIN
  BEGIN INSERT INTO public.links_curtos(codigo, destino, cliente_id) VALUES ('bio-ig', 'https://x.co', '10000000-0000-0000-0000-000000000333'); RAISE EXCEPTION 'aceitou código repetido';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public.links_curtos(codigo, destino, cliente_id) VALUES ('js-link', 'javascript:alert(1)', '10000000-0000-0000-0000-000000000333'); RAISE EXCEPTION 'aceitou destino que não é http';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.links_curtos SET cliques = 999; RAISE EXCEPTION 'dono editou cliques';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF public.resolver_link_curto(' BIO-IG ') <> 'https://infopro-hub.vercel.app/quiz/abc?utm_source=ig' THEN RAISE EXCEPTION 'não resolveu'; END IF;
  IF public.resolver_link_curto('nao-existe') IS NOT NULL THEN RAISE EXCEPTION 'resolveu código inexistente'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT cliques FROM public.links_curtos WHERE codigo = 'bio-ig') <> 1 THEN RAISE EXCEPTION 'clique não contou'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000332',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.links_curtos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu o link'; END IF;
  BEGIN INSERT INTO public.links_curtos(codigo, destino, cliente_id) VALUES ('invasor', 'https://x.co', '10000000-0000-0000-0000-000000000333'); RAISE EXCEPTION 'criou no projeto alheio';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
