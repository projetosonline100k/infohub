-- Embaixadores (19/11/2026, Davi: "dentro de cada projeto, uma área onde a pessoa faz login e vê só a dela: vendas, leads, quantas pessoas trouxe,
-- quem fechou e entra na esteira, links liberados por mim. Não quero chamar de afiliado, e sim embaixador").
-- O embaixador é o afiliado do quiz, mas por PROJETO: o mesmo código (utm_content = aff_<código>) vale em qualquer link do projeto (quiz, oferta única…)
-- e a atribuição das vendas segue as mesmas regras do quiz (marca no checkout; senão, o último lead com o e-mail do comprador).
-- O embaixador entra com a própria conta e só enxerga o que as funções abaixo devolvem: nada de e-mail/telefone de lead, nada do resto do Hub.
CREATE TABLE public.embaixadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 80),
  email text NOT NULL CHECK (position('@' in email) > 1 AND length(email) <= 160),
  codigo text NOT NULL CHECK (codigo ~ '^[a-z0-9]{3,24}$'),
  comissao_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (comissao_pct >= 0 AND comissao_pct <= 100),
  ativo boolean NOT NULL DEFAULT true,
  convite uuid DEFAULT gen_random_uuid(),            -- vira NULL quando a pessoa cria a conta
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX embaixadores_codigo_idx ON public.embaixadores (codigo);
CREATE UNIQUE INDEX embaixadores_convite_idx ON public.embaixadores (convite) WHERE convite IS NOT NULL;
CREATE UNIQUE INDEX embaixadores_auth_idx ON public.embaixadores (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX embaixadores_cliente_idx ON public.embaixadores (cliente_id);

-- Links liberados por você (quiz, ofertas únicas…). embaixador_id NULL = todos os embaixadores do projeto.
CREATE TABLE public.embaixador_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  embaixador_id uuid REFERENCES public.embaixadores(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (btrim(titulo) <> '' AND length(titulo) <= 100),
  destino text NOT NULL CHECK (destino ~* '^https?://' AND length(destino) <= 600),
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX embaixador_links_cliente_idx ON public.embaixador_links (cliente_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['embaixadores', 'embaixador_links'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format($p$CREATE POLICY team_grant_acessar ON public.%1$I FOR SELECT TO authenticated USING (public.team_row_allowed(%1$L, to_jsonb(%1$I.*), 'conteudo', 'acessar'))$p$, t);
    EXECUTE format($p$CREATE POLICY team_grant_insert ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(%1$L, to_jsonb(%1$I.*), 'conteudo', 'criar'))$p$, t);
    EXECUTE format($p$CREATE POLICY team_grant_update ON public.%1$I FOR UPDATE TO authenticated USING (public.team_row_allowed(%1$L, to_jsonb(%1$I.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed(%1$L, to_jsonb(%1$I.*), 'conteudo', 'editar'))$p$, t);
    EXECUTE format($p$CREATE POLICY team_grant_excluir ON public.%1$I FOR DELETE TO authenticated USING (public.team_row_allowed(%1$L, to_jsonb(%1$I.*), 'conteudo', 'excluir'))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
GRANT UPDATE (nome, email, comissao_pct, ativo) ON public.embaixadores TO authenticated;       -- o código e a conta nunca mudam por aqui
GRANT UPDATE (titulo, destino, ativo, ordem, embaixador_id) ON public.embaixador_links TO authenticated;

-- ===== Convite =====
-- Quem abre o link do convite (ainda sem conta) vê só o nome e o e-mail cadastrados.
CREATE FUNCTION public.embaixador_convite_info(p_token uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nome', e.nome, 'email', e.email, 'projeto', c.nome_especialista)
  FROM public.embaixadores e JOIN public.clientes c ON c.id = e.cliente_id
  WHERE e.convite = p_token AND e.auth_user_id IS NULL AND e.ativo
$$;
-- Depois de criar a conta (ou entrar), a pessoa liga o convite à conta dela.
CREATE FUNCTION public.embaixador_aceitar_convite(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores; mail text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta primeiro' USING ERRCODE = '28000'; END IF;
  SELECT lower(email) INTO mail FROM auth.users WHERE id = auth.uid();
  SELECT * INTO emb FROM public.embaixadores WHERE convite = p_token AND auth_user_id IS NULL AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite inválido ou já usado' USING ERRCODE = 'P0002'; END IF;
  IF mail IS DISTINCT FROM lower(emb.email) THEN RAISE EXCEPTION 'Use o e-mail do convite (%)', emb.email USING ERRCODE = '42501'; END IF;
  UPDATE public.embaixadores SET auth_user_id = auth.uid(), convite = NULL WHERE id = emb.id;
  RETURN jsonb_build_object('nome', emb.nome);
END $$;

-- ===== Leitura do embaixador (só o que é dele) =====
CREATE FUNCTION public.embaixador_atual() RETURNS public.embaixadores
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.embaixadores WHERE auth_user_id = auth.uid() AND ativo LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.embaixador_atual() FROM PUBLIC, anon, authenticated;

-- Vendas e reembolsos creditados ao embaixador (regras do quiz: marca no checkout; senão, o último lead com o e-mail do comprador).
CREATE FUNCTION public.embaixador_vendas_base(emb public.embaixadores)
RETURNS TABLE (transacao_id text, tipo text, valor numeric, data date, comprador_nome text, comprador_email text, produto text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.transacao_id, v.tipo, coalesce(v.valor, 0), v.data, v.comprador_nome, v.comprador_email, p.nome_produto
  FROM public.vendas_plataforma_eventos v JOIN public.produtos_cliente p ON p.id = v.produto_id
  WHERE p.cliente_id = emb.cliente_id AND v.tipo IN ('venda', 'reembolso')
    AND ( lower(coalesce(v.utm_content, '')) = 'aff_' || emb.codigo
       OR ( coalesce(v.utm_content, '') !~* '^aff_' AND coalesce(v.comprador_email, '') <> ''
            AND ( SELECT lower(r.utm->>'utm_content') FROM public.quiz_respostas r
                  WHERE r.cliente_id = emb.cliente_id AND lower(r.email) = lower(v.comprador_email)
                    AND r.criada_em <= v.data::timestamp + interval '1 day' + interval '3 hours'
                  ORDER BY r.criada_em DESC LIMIT 1 ) = 'aff_' || emb.codigo ) )
$$;
REVOKE ALL ON FUNCTION public.embaixador_vendas_base(public.embaixadores) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.embaixador_eu() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nome', e.nome, 'codigo', e.codigo, 'comissao_pct', e.comissao_pct, 'projeto', c.nome_especialista)
  FROM public.embaixadores e JOIN public.clientes c ON c.id = e.cliente_id WHERE e.auth_user_id = auth.uid() AND e.ativo
$$;

CREATE FUNCTION public.embaixador_painel(p_dias integer DEFAULT 30) RETURNS jsonb
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
  ven AS (SELECT * FROM public.embaixador_vendas_base(emb)),
  serie AS (
    SELECT d.dia, (SELECT count(*) FROM vis WHERE vis.dia = d.dia) AS visitas, (SELECT count(*) FROM led WHERE led.dia = d.dia) AS leads,
           (SELECT count(*) FROM ven WHERE ven.tipo = 'venda' AND ven.data = d.dia) AS vendas,
           (SELECT coalesce(sum(valor), 0) FROM ven WHERE ven.tipo = 'venda' AND ven.data = d.dia) AS receita
    FROM dias d ORDER BY d.dia)
  SELECT jsonb_build_object(
    'visitas', (SELECT count(*) FROM vis WHERE vis.dia >= ini),
    'leads', (SELECT count(*) FROM led WHERE led.dia >= ini),
    'vendas', (SELECT count(*) FROM ven WHERE tipo = 'venda' AND data >= ini),
    'bruto', (SELECT coalesce(sum(valor), 0) FROM ven WHERE tipo = 'venda' AND data >= ini),
    'reembolsado', (SELECT coalesce(sum(valor), 0) FROM ven WHERE tipo = 'reembolso' AND data >= ini),
    'comissao_pct', emb.comissao_pct,
    'trouxe_total', (SELECT count(*) FROM public.quiz_respostas r WHERE r.cliente_id = emb.cliente_id AND lower(r.utm->>'utm_content') = 'aff_' || emb.codigo),
    'dias', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'visitas', visitas, 'leads', leads, 'vendas', vendas, 'receita', receita)), '[]') FROM serie)
  ) INTO res;
  RETURN res;
END $$;

-- Leads: só nome, etapa e data (nunca e-mail, telefone ou @).
CREATE FUNCTION public.embaixador_leads(p_limite integer DEFAULT 300)
RETURNS TABLE (nome text, etapa text, em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual();
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT coalesce(nullif(btrim(r.nome), ''), 'Sem nome'),
         CASE WHEN EXISTS (SELECT 1 FROM public.embaixador_vendas_base(emb) b WHERE b.tipo = 'venda' AND lower(coalesce(b.comprador_email, '')) = lower(coalesce(r.email, '#'))) THEN 'Comprou'
              ELSE coalesce((SELECT et.nome FROM public.crm_pessoas cp JOIN public.crm_etapas et ON et.id = cp.etapa_id WHERE cp.quiz_resposta_id = r.id LIMIT 1),
                            CASE r.status WHEN 'em_contato' THEN 'Em contato' ELSE 'Novo lead' END) END,
         r.criada_em
  FROM public.quiz_respostas r
  WHERE r.cliente_id = emb.cliente_id AND lower(r.utm->>'utm_content') = 'aff_' || emb.codigo
  ORDER BY r.criada_em DESC LIMIT least(greatest(coalesce(p_limite, 300), 1), 1000);
END $$;

-- Vendas: data, produto, valor e a comissão dele; só o primeiro nome do comprador.
CREATE FUNCTION public.embaixador_vendas(p_limite integer DEFAULT 300)
RETURNS TABLE (data date, tipo text, produto text, comprador text, valor numeric, comissao numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual();
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT b.data, b.tipo, b.produto, coalesce(nullif(split_part(btrim(coalesce(b.comprador_nome, '')), ' ', 1), ''), 'Cliente'), b.valor,
         round(b.valor * emb.comissao_pct / 100 * CASE WHEN b.tipo = 'reembolso' THEN -1 ELSE 1 END, 2)
  FROM public.embaixador_vendas_base(emb) b ORDER BY b.data DESC NULLS LAST LIMIT least(greatest(coalesce(p_limite, 300), 1), 1000);
END $$;

-- Esteira: quem fechou e em que ponto do pós-venda está (etapa do CRM do projeto).
CREATE FUNCTION public.embaixador_esteira()
RETURNS TABLE (nome text, produto text, data date, etapa text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual();
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT coalesce(nullif(btrim(b.comprador_nome), ''), 'Cliente'), b.produto, b.data,
         CASE WHEN EXISTS (SELECT 1 FROM public.embaixador_vendas_base(emb) x WHERE x.transacao_id = b.transacao_id AND x.tipo = 'reembolso') THEN 'Reembolsado'
              ELSE coalesce((SELECT et.nome FROM public.crm_pessoas cp JOIN public.crm_etapas et ON et.id = cp.etapa_id
                             WHERE cp.cliente_id = emb.cliente_id AND lower(coalesce(cp.email, '#')) = lower(coalesce(b.comprador_email, '')) LIMIT 1), 'Comprou') END
  FROM public.embaixador_vendas_base(emb) b WHERE b.tipo = 'venda' ORDER BY b.data DESC NULLS LAST LIMIT 500;
END $$;

CREATE FUNCTION public.embaixador_links_meus()
RETURNS TABLE (id uuid, titulo text, destino text, codigo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_atual();
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT l.id, l.titulo, l.destino, emb.codigo FROM public.embaixador_links l
   WHERE l.cliente_id = emb.cliente_id AND l.ativo AND (l.embaixador_id IS NULL OR l.embaixador_id = emb.id) ORDER BY l.ordem, l.criado_em;
END $$;

REVOKE ALL ON FUNCTION public.embaixador_convite_info(uuid), public.embaixador_aceitar_convite(uuid), public.embaixador_eu(), public.embaixador_painel(integer),
  public.embaixador_leads(integer), public.embaixador_vendas(integer), public.embaixador_esteira(), public.embaixador_links_meus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.embaixador_convite_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embaixador_aceitar_convite(uuid), public.embaixador_eu(), public.embaixador_painel(integer), public.embaixador_leads(integer),
  public.embaixador_vendas(integer), public.embaixador_esteira(), public.embaixador_links_meus() TO authenticated;
NOTIFY pgrst, 'reload schema';
