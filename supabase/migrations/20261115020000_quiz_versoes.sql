-- Versões do quiz para teste A/B (15/11/2026, Davi: "v2, v3… variáveis dentro do quiz, assim eu não altero o primeiro e faço teste A/B").
-- Cada versão é um quiz próprio (variante_de aponta para o original = V1): estrutura, link, respostas e métricas independentes.
-- Com versões marcadas no teste (ab_ativo) e publicadas, o link do V1 sorteia entre elas (o sorteio fica fixo para cada visitante, no navegador dele).
ALTER TABLE public.quizzes
  ADD COLUMN variante_de uuid REFERENCES public.quizzes(id) ON DELETE CASCADE,
  ADD COLUMN versao integer NOT NULL DEFAULT 1,
  ADD COLUMN ab_ativo boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX quizzes_versao_uq ON public.quizzes (variante_de, versao) WHERE variante_de IS NOT NULL;
CREATE INDEX quizzes_variante_idx ON public.quizzes (variante_de) WHERE variante_de IS NOT NULL;
GRANT INSERT (variante_de, versao, ab_ativo) ON public.quizzes TO authenticated;
GRANT UPDATE (ab_ativo) ON public.quizzes TO authenticated;

-- Só uma versão não pode virar variante de outra variante.
CREATE OR REPLACE FUNCTION public.quiz_variante_confere() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.variante_de IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.quizzes p WHERE p.id = NEW.variante_de AND (p.variante_de IS NOT NULL OR p.cliente_id <> NEW.cliente_id)) THEN
      RAISE EXCEPTION 'a versão tem de ser de um quiz original do mesmo projeto';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER quiz_variante_confere BEFORE INSERT OR UPDATE OF variante_de ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.quiz_variante_confere();

-- Link público: quais endereços entram no sorteio (o do original + as versões publicadas marcadas no teste). Vazio = sem teste A/B.
CREATE OR REPLACE FUNCTION public.quiz_ab_slugs(p_slug text) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT id, slug FROM public.quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado' AND variante_de IS NULL LIMIT 1
  ), lista AS (
    SELECT b.slug AS s, 0 AS ord FROM base b
    UNION ALL
    SELECT v.slug, v.versao FROM public.quizzes v JOIN base b ON v.variante_de = b.id WHERE v.status = 'publicado' AND v.ab_ativo
  )
  SELECT CASE WHEN count(*) > 1 THEN array_agg(s ORDER BY ord) ELSE '{}'::text[] END FROM lista;
$$;
GRANT EXECUTE ON FUNCTION public.quiz_ab_slugs(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
