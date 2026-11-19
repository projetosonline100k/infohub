-- Visão do administrador sobre os embaixadores (19/11/2026, Davi: "a minha visualização precisa ser mais bonita e funcional, do jeito que está não tenho nada").
-- Mesmos números que o embaixador vê (embaixador_vendas_base), mas para todos do projeto, para quem tem acesso ao projeto.
CREATE FUNCTION public.embaixadores_resumo(p_cliente uuid, p_dias integer DEFAULT 30)
RETURNS TABLE (embaixador_id uuid, visitas bigint, leads bigint, vendas bigint, bruto numeric, reembolsado numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ini date;
BEGIN
  IF NOT public.team_allowed(p_cliente, 'conteudo', 'acessar') THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  ini := CASE WHEN p_dias IS NULL OR p_dias <= 0 THEN date '1970-01-01' ELSE (now() AT TIME ZONE 'America/Sao_Paulo')::date - (least(p_dias, 3650) - 1) END;
  RETURN QUERY
  SELECT e.id,
    (SELECT count(*) FROM (SELECT min(ev.criado_em) AS m FROM public.quiz_eventos ev
        WHERE ev.cliente_id = e.cliente_id AND lower(ev.utm->>'utm_content') = 'aff_' || e.codigo GROUP BY ev.sessao) x
      WHERE (x.m AT TIME ZONE 'America/Sao_Paulo')::date >= ini),
    (SELECT count(*) FROM public.quiz_respostas r WHERE r.cliente_id = e.cliente_id AND lower(r.utm->>'utm_content') = 'aff_' || e.codigo
        AND (r.criada_em AT TIME ZONE 'America/Sao_Paulo')::date >= ini),
    (SELECT count(*) FROM public.embaixador_vendas_base(e) b WHERE b.tipo = 'venda' AND b.data >= ini),
    coalesce((SELECT sum(b.valor) FROM public.embaixador_vendas_base(e) b WHERE b.tipo = 'venda' AND b.data >= ini), 0),
    coalesce((SELECT sum(b.valor) FROM public.embaixador_vendas_base(e) b WHERE b.tipo = 'reembolso' AND b.data >= ini), 0)
  FROM public.embaixadores e WHERE e.cliente_id = p_cliente;
END $$;

-- Vendas de UM embaixador (para a ficha dele na tela do administrador).
CREATE FUNCTION public.embaixador_vendas_admin(p_embaixador uuid)
RETURNS TABLE (data date, tipo text, produto text, comprador text, valor numeric, comissao numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores;
BEGIN
  SELECT * INTO emb FROM public.embaixadores WHERE id = p_embaixador;
  IF emb.id IS NULL OR NOT public.team_allowed(emb.cliente_id, 'conteudo', 'acessar') THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT b.data, b.tipo, b.produto, coalesce(nullif(btrim(b.comprador_nome), ''), 'Cliente'), b.valor,
         round(b.valor * emb.comissao_pct / 100 * CASE WHEN b.tipo = 'reembolso' THEN -1 ELSE 1 END, 2)
  FROM public.embaixador_vendas_base(emb) b ORDER BY b.data DESC NULLS LAST LIMIT 200;
END $$;

REVOKE ALL ON FUNCTION public.embaixadores_resumo(uuid, integer), public.embaixador_vendas_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embaixadores_resumo(uuid, integer), public.embaixador_vendas_admin(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
