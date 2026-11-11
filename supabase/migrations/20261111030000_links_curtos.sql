-- Links curtos (11/11/2026, Davi: "o link com UTM fica feio na mensagem da automação"): infopro-hub.vercel.app/r/<codigo>
-- leva ao endereço completo (quiz + UTM) e conta o clique. Quem cria é o dono do projeto; resolver é público.
CREATE TABLE public.links_curtos (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  destino text NOT NULL CHECK (destino ~* '^https?://' AND length(destino) <= 2000),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  quiz_link_id uuid REFERENCES public.quiz_links(id) ON DELETE CASCADE,
  cliques integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX links_curtos_link_idx ON public.links_curtos (quiz_link_id);
ALTER TABLE public.links_curtos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.links_curtos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.links_curtos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.links_curtos FOR SELECT TO authenticated USING (public.team_row_allowed('links_curtos', to_jsonb(links_curtos.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.links_curtos FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('links_curtos', to_jsonb(links_curtos.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.links_curtos FOR UPDATE TO authenticated USING (public.team_row_allowed('links_curtos', to_jsonb(links_curtos.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('links_curtos', to_jsonb(links_curtos.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.links_curtos FOR DELETE TO authenticated USING (public.team_row_allowed('links_curtos', to_jsonb(links_curtos.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, UPDATE (destino), DELETE ON public.links_curtos TO authenticated;   -- cliques só o servidor mexe

-- Público: devolve o destino e conta o clique.
CREATE OR REPLACE FUNCTION public.resolver_link_curto(p_codigo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d text;
BEGIN
  UPDATE links_curtos SET cliques = cliques + 1 WHERE codigo = lower(btrim(p_codigo)) RETURNING destino INTO d;
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_link_curto(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_link_curto(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
