-- Tags de lead: membro só mexe nas do próprio projeto; a tag precisa ser de um lead do mesmo projeto.
BEGIN;
DO $$
DECLARE dono uuid; cli uuid; resp uuid; outro_cli uuid; n int;
BEGIN
  SELECT user_id, cliente_id, id INTO dono, cli, resp FROM public.quiz_respostas WHERE user_id IS NOT NULL LIMIT 1;
  IF resp IS NULL THEN RAISE NOTICE 'sem lead para testar'; RETURN; END IF;
  SELECT id INTO outro_cli FROM public.clientes WHERE id <> cli LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', dono, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.quiz_lead_tags (cliente_id, resposta_id, tag) VALUES (cli, resp, 'teste-tag');
  SELECT count(*) INTO n FROM public.quiz_lead_tags WHERE resposta_id = resp AND tag = 'teste-tag';
  IF n <> 1 THEN RAISE EXCEPTION 'dono não vê a própria tag'; END IF;
  IF outro_cli IS NOT NULL THEN
    BEGIN
      INSERT INTO public.quiz_lead_tags (cliente_id, resposta_id, tag) VALUES (outro_cli, resp, 'cruzada');
      RAISE EXCEPTION 'tag de lead em outro projeto passou';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  END IF;
  BEGIN
    INSERT INTO public.quiz_lead_tags (cliente_id, resposta_id, tag) VALUES (cli, resp, 'MAIÚSCULA');
    RAISE EXCEPTION 'tag em maiúscula passou';
  EXCEPTION WHEN check_violation THEN NULL; END;
  DELETE FROM public.quiz_lead_tags WHERE resposta_id = resp AND tag = 'teste-tag';
  RESET ROLE;
END $$;
ROLLBACK;
