-- (20/11/2026) Blocos dos embaixadores: o administrador cria "Bloco 1, 2, 3…" nas guias Creator e Materiais;
-- cada bloco abre como um documento (headlines, roteiros, orientações) dentro da área do embaixador.
CREATE TABLE public.embaixador_blocos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  embaixador_id uuid REFERENCES public.embaixadores(id) ON DELETE CASCADE,   -- NULL = todos do projeto
  secao text NOT NULL CHECK (secao IN ('creator', 'materiais')),
  titulo text NOT NULL CHECK (btrim(titulo) <> '' AND length(titulo) <= 120),
  conteudo text NOT NULL DEFAULT '' CHECK (length(conteudo) <= 400000),     -- HTML do editor
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX embaixador_blocos_cliente_idx ON public.embaixador_blocos (cliente_id, secao);

ALTER TABLE public.embaixador_blocos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.embaixador_blocos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.embaixador_blocos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE FUNCTION public.embaixador_blocos_atualizado() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;
CREATE TRIGGER atualizado BEFORE UPDATE ON public.embaixador_blocos FOR EACH ROW EXECUTE FUNCTION public.embaixador_blocos_atualizado();
CREATE POLICY team_grant_acessar ON public.embaixador_blocos FOR SELECT TO authenticated USING (public.team_row_allowed('embaixador_blocos', to_jsonb(embaixador_blocos.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.embaixador_blocos FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('embaixador_blocos', to_jsonb(embaixador_blocos.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.embaixador_blocos FOR UPDATE TO authenticated USING (public.team_row_allowed('embaixador_blocos', to_jsonb(embaixador_blocos.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('embaixador_blocos', to_jsonb(embaixador_blocos.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.embaixador_blocos FOR DELETE TO authenticated USING (public.team_row_allowed('embaixador_blocos', to_jsonb(embaixador_blocos.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, DELETE ON public.embaixador_blocos TO authenticated;
GRANT UPDATE (titulo, conteudo, ativo, ordem, embaixador_id) ON public.embaixador_blocos TO authenticated;

CREATE FUNCTION public.embaixador_blocos_minhas(p_secao text, p_embaixador uuid DEFAULT NULL)
RETURNS TABLE (id uuid, titulo text, conteudo text, ordem integer, atualizado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores := public.embaixador_alvo(p_embaixador);
BEGIN
  IF emb.id IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT b.id, b.titulo, b.conteudo, b.ordem, b.atualizado_em FROM public.embaixador_blocos b
   WHERE b.cliente_id = emb.cliente_id AND b.secao = p_secao AND b.ativo AND (b.embaixador_id IS NULL OR b.embaixador_id = emb.id) ORDER BY b.ordem, b.criado_em;
END $$;
REVOKE ALL ON FUNCTION public.embaixador_blocos_minhas(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embaixador_blocos_minhas(text, uuid) TO authenticated;
