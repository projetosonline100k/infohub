-- Postagens dos embaixadores + séries para os gráficos (19/11/2026, Davi: "ver gráfico e tals, postagens na semana, mês").
-- Hoje o embaixador registra o que postou (título, plataforma, link, data). A etapa de subir o vídeo e o sistema programar entra na MESMA tabela
-- (status 'programada' com data futura → 'postada').
CREATE TABLE public.embaixador_postagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  embaixador_id uuid NOT NULL REFERENCES public.embaixadores(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (btrim(titulo) <> '' AND length(titulo) <= 140),
  plataforma text NOT NULL DEFAULT 'instagram' CHECK (plataforma IN ('instagram', 'tiktok', 'youtube', 'outra')),
  link text CHECK (link IS NULL OR (link ~* '^https?://' AND length(link) <= 600)),
  status text NOT NULL DEFAULT 'postada' CHECK (status IN ('programada', 'postada')),
  postada_em timestamptz NOT NULL DEFAULT now(),
  criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX embaixador_postagens_emb_idx ON public.embaixador_postagens (embaixador_id, postada_em);
CREATE INDEX embaixador_postagens_cliente_idx ON public.embaixador_postagens (cliente_id, postada_em);
ALTER TABLE public.embaixador_postagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.embaixador_postagens FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.embaixador_postagens FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.embaixador_postagens FOR SELECT TO authenticated USING (public.team_row_allowed('embaixador_postagens', to_jsonb(embaixador_postagens.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_excluir ON public.embaixador_postagens FOR DELETE TO authenticated USING (public.team_row_allowed('embaixador_postagens', to_jsonb(embaixador_postagens.*), 'conteudo', 'excluir'));
GRANT SELECT, DELETE ON public.embaixador_postagens TO authenticated;

-- ===== Lado do embaixador =====
CREATE FUNCTION public.embaixador_postagem_registrar(p_titulo text, p_plataforma text, p_link text, p_quando timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual(); novo uuid;
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.embaixador_postagens(cliente_id, user_id, embaixador_id, titulo, plataforma, link, status, postada_em)
  VALUES (emb.cliente_id, emb.user_id, emb.id, p_titulo, coalesce(nullif(p_plataforma, ''), 'instagram'), nullif(btrim(p_link), ''),
          CASE WHEN coalesce(p_quando, now()) > now() THEN 'programada' ELSE 'postada' END, coalesce(p_quando, now()))
  RETURNING id INTO novo;
  RETURN novo;
END $$;

CREATE FUNCTION public.embaixador_postagens_minhas(p_limite integer DEFAULT 200)
RETURNS TABLE (id uuid, titulo text, plataforma text, link text, status text, postada_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual();
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.id, p.titulo, p.plataforma, p.link, p.status, p.postada_em FROM public.embaixador_postagens p
   WHERE p.embaixador_id = emb.id ORDER BY p.postada_em DESC LIMIT least(greatest(coalesce(p_limite, 200), 1), 1000);
END $$;

CREATE FUNCTION public.embaixador_postagem_apagar(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual();
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.embaixador_postagens WHERE id = p_id AND embaixador_id = emb.id;
END $$;

-- O painel do embaixador ganha as postagens (total e por dia).
CREATE OR REPLACE FUNCTION public.embaixador_painel(p_dias integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual(); ini date; res jsonb;
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  p_dias := least(greatest(coalesce(p_dias, 30), 1), 365);
  ini := (now() AT TIME ZONE 'America/Sao_Paulo')::date - (p_dias - 1);
  WITH dias AS (SELECT d::date AS dia FROM generate_series(ini, (now() AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') d),
  vis AS (SELECT (min(e.criado_em) AT TIME ZONE 'America/Sao_Paulo')::date AS dia FROM public.quiz_eventos e
          WHERE e.cliente_id = emb.cliente_id AND lower(e.utm->>'utm_content') = 'aff_' || emb.codigo GROUP BY e.sessao),
  led AS (SELECT (r.criada_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia FROM public.quiz_respostas r
          WHERE r.cliente_id = emb.cliente_id AND lower(r.utm->>'utm_content') = 'aff_' || emb.codigo),
  pos AS (SELECT (p.postada_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia FROM public.embaixador_postagens p WHERE p.embaixador_id = emb.id AND p.status = 'postada'),
  ven AS (SELECT * FROM public.embaixador_vendas_base(emb)),
  serie AS (
    SELECT d.dia, (SELECT count(*) FROM vis WHERE vis.dia = d.dia) AS visitas, (SELECT count(*) FROM led WHERE led.dia = d.dia) AS leads,
           (SELECT count(*) FROM ven WHERE ven.tipo = 'venda' AND ven.data = d.dia) AS vendas,
           (SELECT coalesce(sum(valor), 0) FROM ven WHERE ven.tipo = 'venda' AND ven.data = d.dia) AS receita,
           (SELECT count(*) FROM pos WHERE pos.dia = d.dia) AS postagens
    FROM dias d ORDER BY d.dia)
  SELECT jsonb_build_object(
    'visitas', (SELECT count(*) FROM vis WHERE vis.dia >= ini),
    'leads', (SELECT count(*) FROM led WHERE led.dia >= ini),
    'vendas', (SELECT count(*) FROM ven WHERE tipo = 'venda' AND data >= ini),
    'bruto', (SELECT coalesce(sum(valor), 0) FROM ven WHERE tipo = 'venda' AND data >= ini),
    'reembolsado', (SELECT coalesce(sum(valor), 0) FROM ven WHERE tipo = 'reembolso' AND data >= ini),
    'comissao_pct', emb.comissao_pct,
    'trouxe_total', (SELECT count(*) FROM public.quiz_respostas r WHERE r.cliente_id = emb.cliente_id AND lower(r.utm->>'utm_content') = 'aff_' || emb.codigo),
    'postagens', (SELECT count(*) FROM pos WHERE pos.dia >= ini),
    'dias', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'visitas', visitas, 'leads', leads, 'vendas', vendas, 'receita', receita, 'postagens', postagens)), '[]') FROM serie)
  ) INTO res;
  RETURN res;
END $$;

-- ===== Lado do administrador: uma linha por dia e por embaixador (o gráfico soma por semana/mês no navegador) =====
CREATE FUNCTION public.embaixadores_serie(p_cliente uuid, p_dias integer DEFAULT 90)
RETURNS TABLE (dia date, embaixador_id uuid, leads bigint, vendas bigint, receita numeric, postagens bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ini date;
BEGIN
  IF NOT public.team_allowed(p_cliente, 'conteudo', 'acessar') THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  ini := CASE WHEN p_dias IS NULL OR p_dias <= 0 THEN date '1970-01-01' ELSE (now() AT TIME ZONE 'America/Sao_Paulo')::date - (least(p_dias, 3650) - 1) END;
  RETURN QUERY
  WITH eventos AS (
    SELECT e.id AS emb, (r.criada_em AT TIME ZONE 'America/Sao_Paulo')::date AS d, 1 AS leads, 0 AS vendas, 0::numeric AS receita, 0 AS postagens
      FROM public.embaixadores e JOIN public.quiz_respostas r ON r.cliente_id = e.cliente_id AND lower(r.utm->>'utm_content') = 'aff_' || e.codigo WHERE e.cliente_id = p_cliente
    UNION ALL
    SELECT e.id, b.data, 0, 1, b.valor, 0 FROM public.embaixadores e, LATERAL public.embaixador_vendas_base(e) b WHERE e.cliente_id = p_cliente AND b.tipo = 'venda'
    UNION ALL
    SELECT p.embaixador_id, (p.postada_em AT TIME ZONE 'America/Sao_Paulo')::date, 0, 0, 0::numeric, 1 FROM public.embaixador_postagens p WHERE p.cliente_id = p_cliente AND p.status = 'postada')
  SELECT ev.d, ev.emb, sum(ev.leads)::bigint, sum(ev.vendas)::bigint, coalesce(sum(ev.receita), 0), sum(ev.postagens)::bigint
  FROM eventos ev WHERE ev.d >= ini GROUP BY ev.d, ev.emb ORDER BY ev.d;
END $$;

REVOKE ALL ON FUNCTION public.embaixador_postagem_registrar(text, text, text, timestamptz), public.embaixador_postagens_minhas(integer), public.embaixador_postagem_apagar(uuid),
  public.embaixadores_serie(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embaixador_postagem_registrar(text, text, text, timestamptz), public.embaixador_postagens_minhas(integer), public.embaixador_postagem_apagar(uuid),
  public.embaixadores_serie(uuid, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
