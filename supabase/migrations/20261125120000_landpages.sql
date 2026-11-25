-- Land page por projeto (25/11/2026, Davi: "vamos juntar Quiz e Chatbot em 'Páginas' e adicionar Land page, uma página comprida, com VSL").
-- A página é montada em blocos na aba Páginas e publicada em /p/<slug>. `config` é o rascunho; `publicada` é a cópia que o link público mostra
-- (Publicar copia config → publicada). Visitas, play do vídeo e cliques no botão entram por RPC (anon), um por sessão e tipo.
CREATE TABLE public.landpages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  slug text NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10) CHECK (slug ~ '^[a-z0-9-]{4,60}$'),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'pausado')),
  -- {fundo, cor, escuro, blocos:[{id, tipo, ...}]}
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  publicada jsonb,
  publicado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX landpages_cliente_idx ON public.landpages (cliente_id, criado_em DESC);

CREATE TABLE public.landpage_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landpage_id uuid NOT NULL REFERENCES public.landpages(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  sessao uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('visita', 'play', 'metade', 'fim_video', 'cta')),
  utm jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
-- Um registro por sessão e tipo (recarregar a página não conta duas vezes).
CREATE UNIQUE INDEX landpage_eventos_unico ON public.landpage_eventos (landpage_id, sessao, tipo);
CREATE INDEX landpage_eventos_lp_idx ON public.landpage_eventos (landpage_id, criado_em);

CREATE OR REPLACE FUNCTION public.landpage_confere()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'publicado' THEN
    IF jsonb_array_length(coalesce(NEW.publicada->'blocos', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'land page sem blocos não pode ser publicada';
    END IF;
    IF OLD IS NULL OR OLD.status IS DISTINCT FROM 'publicado' THEN NEW.publicado_em := now(); END IF;
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER landpage_confere BEFORE INSERT OR UPDATE ON public.landpages FOR EACH ROW EXECUTE FUNCTION public.landpage_confere();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['landpages', 'landpage_eventos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''acessar''))', t, t, t);
  END LOOP;
  EXECUTE 'CREATE POLICY team_grant_insert ON public.landpages FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(''landpages'', to_jsonb(landpages.*), ''conteudo'', ''criar''))';
  EXECUTE 'CREATE POLICY team_grant_update ON public.landpages FOR UPDATE TO authenticated USING (public.team_row_allowed(''landpages'', to_jsonb(landpages.*), ''conteudo'', ''editar'')) WITH CHECK (public.team_row_allowed(''landpages'', to_jsonb(landpages.*), ''conteudo'', ''editar''))';
  EXECUTE 'CREATE POLICY team_grant_excluir ON public.landpages FOR DELETE TO authenticated USING (public.team_row_allowed(''landpages'', to_jsonb(landpages.*), ''conteudo'', ''excluir''))';
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landpages TO authenticated;
GRANT SELECT ON public.landpage_eventos TO authenticated;   -- evento só entra pelo RPC

-- Público: só a cópia publicada, e só com a página no ar.
CREATE OR REPLACE FUNCTION public.landpage_publica(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nome', nome, 'config', publicada) FROM landpages WHERE slug = p_slug AND status = 'publicado';
$$;

CREATE OR REPLACE FUNCTION public.landpage_evento(p_slug text, p_sessao uuid, p_tipo text, p_utm jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record;
BEGIN
  IF p_sessao IS NULL OR p_tipo NOT IN ('visita', 'play', 'metade', 'fim_video', 'cta') THEN RETURN; END IF;
  SELECT id, cliente_id INTO l FROM landpages WHERE slug = p_slug AND status = 'publicado';
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO landpage_eventos (landpage_id, cliente_id, sessao, tipo, utm)
  VALUES (l.id, l.cliente_id, p_sessao, p_tipo,
          CASE WHEN jsonb_typeof(p_utm) = 'object' AND length(p_utm::text) <= 2000 THEN p_utm END)
  ON CONFLICT (landpage_id, sessao, tipo) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.landpage_publica(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.landpage_evento(text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landpage_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.landpage_evento(text, uuid, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
