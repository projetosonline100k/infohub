-- Regressão: a land page só abre publicada (e mostra a cópia publicada, não o rascunho); o evento entra pelo RPC, sem duplicar por sessão e
-- tipo; página sem blocos não publica; outro usuário não vê nem lê as páginas.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000271','lp-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000272','lp-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000271',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000273', 'LP teste', 30, 'x', '10000000-0000-0000-0000-000000000271');
INSERT INTO public.landpages(id, cliente_id, nome, slug, config) VALUES
 ('10000000-0000-0000-0000-000000000274', '10000000-0000-0000-0000-000000000273', 'A', 'lp-teste-a', '{"blocos":[{"id":"b1","tipo":"titulo","texto":"rascunho"}]}');

DO $$
BEGIN
  IF public.landpage_publica('lp-teste-a') IS NOT NULL THEN RAISE EXCEPTION 'rascunho abriu pelo link'; END IF;
  PERFORM public.landpage_evento('lp-teste-a', '10000000-0000-0000-0000-000000000275', 'visita', '{}');
  IF (SELECT count(*) FROM public.landpage_eventos) <> 0 THEN RAISE EXCEPTION 'evento de página fora do ar foi gravado'; END IF;
  BEGIN
    UPDATE public.landpages SET status = 'publicado' WHERE id = '10000000-0000-0000-0000-000000000274';
    RAISE EXCEPTION 'publicou sem cópia publicada';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'land page sem blocos%' THEN RAISE; END IF; END;
  UPDATE public.landpages SET status = 'publicado', publicada = config WHERE id = '10000000-0000-0000-0000-000000000274';
  UPDATE public.landpages SET config = '{"blocos":[{"id":"b1","tipo":"titulo","texto":"novo rascunho"}]}' WHERE id = '10000000-0000-0000-0000-000000000274';
  IF public.landpage_publica('lp-teste-a')->'config'->'blocos'->0->>'texto' <> 'rascunho' THEN RAISE EXCEPTION 'link mostrou o rascunho, não a cópia publicada'; END IF;
  IF (SELECT publicado_em FROM public.landpages WHERE id = '10000000-0000-0000-0000-000000000274') IS NULL THEN RAISE EXCEPTION 'sem data de publicação'; END IF;
  PERFORM public.landpage_evento('lp-teste-a', '10000000-0000-0000-0000-000000000275', 'visita', '{"utm_source":"ig"}');
  PERFORM public.landpage_evento('lp-teste-a', '10000000-0000-0000-0000-000000000275', 'visita', '{"utm_source":"ig"}');
  PERFORM public.landpage_evento('lp-teste-a', '10000000-0000-0000-0000-000000000275', 'play', null);
  PERFORM public.landpage_evento('lp-teste-a', '10000000-0000-0000-0000-000000000275', 'invalido', null);
  IF (SELECT count(*) FROM public.landpage_eventos) <> 2 THEN RAISE EXCEPTION 'contagem de eventos errada (duplicou ou aceitou tipo inválido)'; END IF;
  UPDATE public.landpages SET status = 'pausado' WHERE id = '10000000-0000-0000-0000-000000000274';
  IF public.landpage_publica('lp-teste-a') IS NOT NULL THEN RAISE EXCEPTION 'pausada abriu pelo link'; END IF;
END $$;

-- outro usuário (fora da equipe) não enxerga
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000272',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.landpages) <> 0 THEN RAISE EXCEPTION 'outro usuário viu a land page'; END IF;
  IF (SELECT count(*) FROM public.landpage_eventos) <> 0 THEN RAISE EXCEPTION 'outro usuário viu os eventos'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
