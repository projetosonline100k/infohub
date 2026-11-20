-- (20/11/2026) Aulas dos embaixadores: o administrador cola o link do Google Drive e a aula aparece na área deles.
CREATE TABLE public.embaixador_aulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  embaixador_id uuid REFERENCES public.embaixadores(id) ON DELETE CASCADE,   -- NULL = todos do projeto
  modulo text NOT NULL DEFAULT 'Aulas' CHECK (btrim(modulo) <> '' AND length(modulo) <= 80),
  titulo text NOT NULL CHECK (btrim(titulo) <> '' AND length(titulo) <= 120),
  descricao text CHECK (descricao IS NULL OR length(descricao) <= 1000),
  url text NOT NULL CHECK (url ~* '^https://(drive|docs)\.google\.com/' AND length(url) <= 600),
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX embaixador_aulas_cliente_idx ON public.embaixador_aulas (cliente_id);

ALTER TABLE public.embaixador_aulas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.embaixador_aulas FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.embaixador_aulas FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.embaixador_aulas FOR SELECT TO authenticated USING (public.team_row_allowed('embaixador_aulas', to_jsonb(embaixador_aulas.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.embaixador_aulas FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('embaixador_aulas', to_jsonb(embaixador_aulas.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.embaixador_aulas FOR UPDATE TO authenticated USING (public.team_row_allowed('embaixador_aulas', to_jsonb(embaixador_aulas.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('embaixador_aulas', to_jsonb(embaixador_aulas.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.embaixador_aulas FOR DELETE TO authenticated USING (public.team_row_allowed('embaixador_aulas', to_jsonb(embaixador_aulas.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, DELETE ON public.embaixador_aulas TO authenticated;
GRANT UPDATE (modulo, titulo, descricao, url, ativo, ordem, embaixador_id) ON public.embaixador_aulas TO authenticated;

CREATE FUNCTION public.embaixador_aulas_minhas(p_embaixador uuid DEFAULT NULL)
RETURNS TABLE (id uuid, modulo text, titulo text, descricao text, url text, criado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_alvo(p_embaixador);
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.id, a.modulo, a.titulo, a.descricao, a.url, a.criado_em FROM public.embaixador_aulas a
   WHERE a.cliente_id = emb.cliente_id AND a.ativo AND (a.embaixador_id IS NULL OR a.embaixador_id = emb.id) ORDER BY a.modulo, a.ordem, a.criado_em;
END $$;
REVOKE ALL ON FUNCTION public.embaixador_aulas_minhas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embaixador_aulas_minhas(uuid) TO authenticated;
