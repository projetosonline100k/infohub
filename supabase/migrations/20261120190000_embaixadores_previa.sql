-- (20/11/2026) "Ver como o embaixador vê": quem tem acesso ao projeto abre a área de um embaixador (só leitura).
-- As funções de leitura ganham p_embaixador (opcional). Sem ele: o embaixador logado. Com ele: exige acesso ao projeto.
CREATE FUNCTION public.embaixador_alvo(p_embaixador uuid) RETURNS public.embaixadores
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores;
BEGIN
  IF p_embaixador IS NULL THEN RETURN public.embaixador_atual(); END IF;
  SELECT * INTO emb FROM public.embaixadores WHERE id = p_embaixador;
  IF NOT FOUND OR NOT public.team_allowed(emb.cliente_id, 'conteudo', 'acessar') THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN emb;
END $$;
REVOKE ALL ON FUNCTION public.embaixador_alvo(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.embaixador_eu();
CREATE FUNCTION public.embaixador_eu(p_embaixador uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nome', a.nome, 'codigo', a.codigo, 'comissao_pct', a.comissao_pct, 'projeto', c.nome_especialista)
  FROM public.embaixador_alvo(p_embaixador) a JOIN public.clientes c ON c.id = a.cliente_id
  WHERE a.id IS NOT NULL AND a.ativo
$$;
REVOKE ALL ON FUNCTION public.embaixador_eu(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embaixador_eu(uuid) TO authenticated;

DO $$
DECLARE r record; d text; args text; novo text; nova_oid oid;
BEGIN
  FOR r IN SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS ident, pg_get_function_arguments(p.oid) AS args
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('embaixador_painel','embaixador_leads','embaixador_vendas','embaixador_esteira','embaixador_links_meus','embaixador_postagens_minhas')
  LOOP
    d := pg_get_functiondef(r.oid);
    args := CASE WHEN r.args = '' THEN 'p_embaixador uuid DEFAULT NULL' ELSE r.args || ', p_embaixador uuid DEFAULT NULL' END;
    novo := replace(d, 'public.' || r.proname || '(' || r.args || ')', 'public.' || r.proname || '(' || args || ')');
    novo := replace(novo, 'public.embaixador_atual()', 'public.embaixador_alvo(p_embaixador)');
    IF novo = d OR position('p_embaixador uuid' in novo) = 0 THEN RAISE EXCEPTION 'não reescreveu %', r.proname; END IF;
    EXECUTE format('DROP FUNCTION public.%I(%s)', r.proname, r.ident);
    EXECUTE novo;
    SELECT p.oid INTO nova_oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.proname;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', nova_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', nova_oid::regprocedure);
  END LOOP;
END $$;
