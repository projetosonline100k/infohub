-- Regressão: o dono renomeia o link curto (mantendo cliques e destino); código repetido ou inválido é recusado; outra pessoa não renomeia.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000401','lc-dono@example.com',now()), ('10000000-0000-0000-0000-000000000402','lc-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000401',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000403', 'LC', 30, 'x', '10000000-0000-0000-0000-000000000401');
SET LOCAL ROLE authenticated;
INSERT INTO public.links_curtos(codigo, destino, cliente_id) VALUES ('rename-a-teste', 'https://exemplo.com/a', '10000000-0000-0000-0000-000000000403'), ('rename-b-teste', 'https://exemplo.com/b', '10000000-0000-0000-0000-000000000403');
DO $$
BEGIN
  UPDATE public.links_curtos SET codigo = 'novo-nome-teste' WHERE codigo = 'rename-a-teste';
  IF NOT EXISTS (SELECT 1 FROM public.links_curtos WHERE codigo = 'novo-nome-teste' AND destino = 'https://exemplo.com/a') THEN RAISE EXCEPTION 'não renomeou'; END IF;
  BEGIN UPDATE public.links_curtos SET codigo = 'rename-b-teste' WHERE codigo = 'novo-nome-teste'; RAISE EXCEPTION 'aceitou código repetido';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN UPDATE public.links_curtos SET codigo = 'Nome Inválido' WHERE codigo = 'novo-nome-teste'; RAISE EXCEPTION 'aceitou código inválido';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000402',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  UPDATE public.links_curtos SET codigo = 'roubado-teste' WHERE codigo = 'rename-b-teste';
  IF EXISTS (SELECT 1 FROM public.links_curtos WHERE codigo = 'roubado-teste') THEN RAISE EXCEPTION 'outra pessoa renomeou'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
