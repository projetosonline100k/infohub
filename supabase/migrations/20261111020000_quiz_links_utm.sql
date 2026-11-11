-- Links do quiz com nome e origem (11/11/2026, Davi: "mudar o link que vai ser mostrado e nomear o link, o nome é UTM,
-- para saber de onde vêm as vendas").
-- 1) O endereço (slug) pode ser trocado; o antigo continua funcionando (slugs_antigos), então links já divulgados não quebram.
-- 2) O link público guarda a UTM da visita e do lead (quiz_eventos.utm, quiz_respostas.utm).
-- 3) quiz_links: links nomeados, cada um com a sua UTM (Bio do Instagram, Story, Anúncio…), com estatística por link.
ALTER TABLE public.quizzes ADD COLUMN slugs_antigos text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.quiz_slug_troca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    IF EXISTS (SELECT 1 FROM quizzes q WHERE q.id <> NEW.id AND (q.slug = NEW.slug OR NEW.slug = ANY (q.slugs_antigos))) THEN
      RAISE EXCEPTION 'esse endereço já está em uso';
    END IF;
    NEW.slugs_antigos := array_remove(array_append(OLD.slugs_antigos, OLD.slug), NEW.slug);   -- o antigo continua valendo
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER quiz_slug_troca BEFORE UPDATE OF slug ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.quiz_slug_troca();

ALTER TABLE public.quiz_eventos ADD COLUMN utm jsonb;
ALTER TABLE public.quiz_respostas ADD COLUMN utm jsonb;

-- Só as chaves utm_* e textos curtos entram.
CREATE OR REPLACE FUNCTION public.quiz_utm_limpa(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(coalesce((SELECT jsonb_object_agg(k, left(v, 120))
    FROM jsonb_each_text(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) AS t(k, v)
    WHERE k IN ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term') AND btrim(v) <> ''), '{}'::jsonb), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.quiz_publico(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('titulo', titulo,
           'estrutura', CASE WHEN status = 'publicado' THEN coalesce(estrutura_publicada, estrutura) ELSE estrutura END)
    FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status IN ('revisar', 'publicado');
$$;

DROP FUNCTION public.registrar_evento_quiz(text, uuid, text, integer);
CREATE OR REPLACE FUNCTION public.registrar_evento_quiz(p_slug text, p_sessao uuid, p_tipo text, p_passo integer DEFAULT -1, p_utm jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  IF p_tipo NOT IN ('visita', 'passo', 'fim', 'cta') OR p_sessao IS NULL THEN RETURN; END IF;
  SELECT id, cliente_id INTO q FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado';
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO quiz_eventos (quiz_id, cliente_id, sessao, tipo, passo, utm)
  VALUES (q.id, q.cliente_id, p_sessao, p_tipo, CASE WHEN p_tipo = 'passo' THEN least(greatest(coalesce(p_passo, 0), 0), 300) ELSE -1 END, quiz_utm_limpa(p_utm))
  ON CONFLICT (quiz_id, sessao, tipo, passo) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_evento_quiz(text, uuid, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_evento_quiz(text, uuid, text, integer, jsonb) TO anon, authenticated;

DROP FUNCTION public.responder_quiz(text, jsonb, text, text, text, text);
CREATE OR REPLACE FUNCTION public.responder_quiz(p_slug text, p_respostas jsonb, p_perfil text, p_nome text, p_email text, p_whatsapp text, p_utm jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT id, cliente_id INTO q FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado';
  IF NOT FOUND THEN RAISE EXCEPTION 'quiz não encontrado'; END IF;
  IF jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_respostas, '[]'::jsonb)) > 100
     OR length(coalesce(p_respostas::text, '')) > 20000 THEN
    RAISE EXCEPTION 'respostas inválidas';
  END IF;
  INSERT INTO quiz_respostas (quiz_id, cliente_id, respostas, perfil, nome, email, whatsapp, utm)
  VALUES (q.id, q.cliente_id, coalesce(p_respostas, '[]'::jsonb), left(nullif(btrim(p_perfil), ''), 80),
          left(nullif(btrim(p_nome), ''), 120), left(nullif(btrim(p_email), ''), 200), left(nullif(btrim(p_whatsapp), ''), 40), quiz_utm_limpa(p_utm));
END;
$$;
REVOKE ALL ON FUNCTION public.responder_quiz(text, jsonb, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.responder_quiz(text, jsonb, text, text, text, text, jsonb) TO anon, authenticated;

CREATE TABLE public.quiz_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 80),
  utm_source text NOT NULL CHECK (btrim(utm_source) <> '' AND length(utm_source) <= 60),
  utm_medium text CHECK (length(utm_medium) <= 60),
  utm_campaign text CHECK (length(utm_campaign) <= 80),
  utm_content text CHECK (length(utm_content) <= 80),
  utm_term text CHECK (length(utm_term) <= 80),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_links_quiz_idx ON public.quiz_links (quiz_id, criado_em);
ALTER TABLE public.quiz_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_links FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.quiz_links FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.quiz_links FOR SELECT TO authenticated USING (public.team_row_allowed('quiz_links', to_jsonb(quiz_links.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.quiz_links FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('quiz_links', to_jsonb(quiz_links.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.quiz_links FOR UPDATE TO authenticated USING (public.team_row_allowed('quiz_links', to_jsonb(quiz_links.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('quiz_links', to_jsonb(quiz_links.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.quiz_links FOR DELETE TO authenticated USING (public.team_row_allowed('quiz_links', to_jsonb(quiz_links.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_links TO authenticated;

NOTIFY pgrst, 'reload schema';
