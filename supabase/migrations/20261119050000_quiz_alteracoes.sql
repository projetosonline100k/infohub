-- Histórico de alterações publicadas do quiz (19/11/2026, Davi: "sempre faço alterações, preciso saber o dia que estava ruim, os dias melhores, se teve alteração").
-- Cada vez que a versão PUBLICADA de um quiz muda, um gatilho grava o que mudou (telas, perguntas, oferta…). O painel mostra isso ao lado de cada dia.
CREATE TABLE public.quiz_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  em timestamptz NOT NULL DEFAULT now(),
  resumo text NOT NULL
);
CREATE INDEX quiz_alteracoes_quiz_idx ON public.quiz_alteracoes (quiz_id, em);
ALTER TABLE public.quiz_alteracoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_alteracoes FROM anon, authenticated;
CREATE POLICY team_grant_acessar ON public.quiz_alteracoes FOR SELECT TO authenticated
  USING (public.team_row_allowed('quiz_alteracoes', to_jsonb(quiz_alteracoes.*), 'conteudo', 'acessar'));
GRANT SELECT ON public.quiz_alteracoes TO authenticated;

CREATE OR REPLACE FUNCTION public.quiz_resumo_alteracao(velho jsonb, novo jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE alt text[] := '{}'; item jsonb; antes jsonb; chave text; rotulo text;
BEGIN
  IF velho IS NULL THEN RETURN 'Primeira publicação'; END IF;
  FOREACH chave IN ARRAY ARRAY['perguntas', 'telas'] LOOP
    rotulo := CASE chave WHEN 'perguntas' THEN 'pergunta' ELSE 'tela' END;
    FOR item IN SELECT * FROM jsonb_array_elements(coalesce(novo->chave, '[]')) LOOP
      SELECT x INTO antes FROM jsonb_array_elements(coalesce(velho->chave, '[]')) x WHERE x->>'id' = item->>'id' LIMIT 1;
      IF antes IS NULL THEN alt := alt || (rotulo || ' nova: ' || coalesce(item->>'id', '?'));
      ELSIF antes IS DISTINCT FROM item THEN alt := alt || (rotulo || ' ' || coalesce(item->>'id', '?')); END IF;
    END LOOP;
    FOR item IN SELECT * FROM jsonb_array_elements(coalesce(velho->chave, '[]')) LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(novo->chave, '[]')) x WHERE x->>'id' = item->>'id') THEN alt := alt || (rotulo || ' removida: ' || coalesce(item->>'id', '?')); END IF;
    END LOOP;
  END LOOP;
  FOREACH chave IN ARRAY ARRAY['oferta', 'perfis', 'captura', 'intro', 'fases', 'etapas', 'cor', 'tema', 'fundo', 'visual', 'resultado'] LOOP
    IF velho->chave IS DISTINCT FROM novo->chave THEN alt := alt || chave; END IF;
  END LOOP;
  IF coalesce(array_length(alt, 1), 0) = 0 THEN RETURN NULL; END IF;
  RETURN 'Mudou: ' || array_to_string(alt[1:8], ', ') || CASE WHEN array_length(alt, 1) > 8 THEN ' (+' || (array_length(alt, 1) - 8) || ')' ELSE '' END;
END $$;

CREATE OR REPLACE FUNCTION public.quiz_registrar_alteracao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  IF NEW.estrutura_publicada IS NULL THEN RETURN NEW; END IF;
  r := public.quiz_resumo_alteracao(OLD.estrutura_publicada, NEW.estrutura_publicada);
  IF r IS NOT NULL THEN
    INSERT INTO public.quiz_alteracoes(quiz_id, cliente_id, user_id, resumo) VALUES (NEW.id, NEW.cliente_id, NEW.user_id, r);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- o histórico nunca impede publicar
END $$;
CREATE TRIGGER quiz_registrar_alteracao AFTER UPDATE OF estrutura_publicada ON public.quizzes
  FOR EACH ROW WHEN (OLD.estrutura_publicada IS DISTINCT FROM NEW.estrutura_publicada) EXECUTE FUNCTION public.quiz_registrar_alteracao();
REVOKE ALL ON FUNCTION public.quiz_registrar_alteracao(), public.quiz_resumo_alteracao(jsonb, jsonb) FROM public, anon, authenticated;

-- Começo do histórico: o que foi ao ar hoje no Instalivros V2.
INSERT INTO public.quiz_alteracoes(quiz_id, cliente_id, user_id, em, resumo)
SELECT id, cliente_id, user_id, now(), 'Conversa em chat nas perguntas, prévia do perfil, áudios dos 5 livros, livro do dia, nome e sobrenome'
  FROM public.quizzes WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7';
NOTIFY pgrst, 'reload schema';
