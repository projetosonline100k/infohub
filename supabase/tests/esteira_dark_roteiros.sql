-- Regressão: o dono sobe roteiros no perfil (numeração V1, V2… por perfil, nasce na fila), edita título/dia/status; não mexe em arquivo/obs; outra pessoa não vê nem sobe no perfil alheio.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000431','ro-dono@example.com',now()), ('10000000-0000-0000-0000-000000000432','ro-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000431',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.esteira_dark_perfis(id, nome) VALUES ('10000000-0000-0000-0000-000000000433', 'Perfil Roteiros');
INSERT INTO public.esteira_dark_roteiros(perfil_id, numero, titulo, texto, data_postagem) VALUES ('10000000-0000-0000-0000-000000000433', 99, 'Primeiro', 'texto do roteiro', '2026-11-20');
INSERT INTO public.esteira_dark_roteiros(perfil_id, titulo, texto) VALUES ('10000000-0000-0000-0000-000000000433', 'Segundo', 'outro texto');
DO $$
BEGIN
  IF (SELECT array_agg(numero ORDER BY numero) FROM public.esteira_dark_roteiros) <> ARRAY[1, 2] THEN RAISE EXCEPTION 'numeração errada (V1, V2 por perfil)'; END IF;
  IF (SELECT status FROM public.esteira_dark_roteiros WHERE numero = 1) <> 'na_fila' THEN RAISE EXCEPTION 'não nasceu na fila'; END IF;
  UPDATE public.esteira_dark_roteiros SET status = 'revisar', data_postagem = '2026-11-25' WHERE numero = 1;
  UPDATE public.esteira_dark_roteiros SET status = 'programando' WHERE numero = 1;
  BEGIN UPDATE public.esteira_dark_roteiros SET versoes = '[1]'::jsonb; RAISE EXCEPTION 'dono mexeu nas versões';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.esteira_dark_roteiros SET arquivo = '/x.mp4'; RAISE EXCEPTION 'dono mexeu no arquivo';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.esteira_dark_roteiros(perfil_id, titulo, texto, status) VALUES ('10000000-0000-0000-0000-000000000433', 'X', 'y', 'programado'); RAISE EXCEPTION 'nasceu já programado';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.esteira_dark_roteiros SET status = 'inventado'; RAISE EXCEPTION 'status inválido';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000432',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.esteira_dark_roteiros) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu os roteiros'; END IF;
  BEGIN INSERT INTO public.esteira_dark_roteiros(perfil_id, titulo, texto) VALUES ('10000000-0000-0000-0000-000000000433', 'invasão', 'x'); RAISE EXCEPTION 'roteiro em perfil alheio';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
