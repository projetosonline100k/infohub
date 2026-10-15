-- Quiz dentro do Infopro (pedido do Davi, 15/10/2026): Conteúdo → Quiz. O Roy
-- de cada projeto é o responsável. Fluxo: alguém do time pede → o Roy faz o
-- ESBOÇO (documento, status 'esboco') → o Davi aprova → o Roy CRIA o quiz
-- (estrutura, status 'criando' → 'revisar') → o Davi aprova → 'publicado',
-- com link público /quiz/<slug>. Respostas chegam por RPC (anon), nunca por
-- insert direto.
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  titulo text NOT NULL CHECK (btrim(titulo) <> ''),
  pedido text,
  slug text NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10) CHECK (slug ~ '^[a-z0-9-]{4,60}$'),
  status text NOT NULL DEFAULT 'esboco' CHECK (status IN ('esboco', 'criando', 'revisar', 'publicado', 'pausado', 'cancelado')),
  -- {intro:{titulo,subtitulo,botao}, perguntas:[{id,texto,opcoes:[{texto,perfil,pontos}]}],
  --  perfis:[{id,nome,descricao,cta_texto,cta_url}], captura:{ativa,titulo,pedir:[nome,email,whatsapp]}, cor}
  estrutura jsonb,
  publicado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quizzes_cliente_idx ON public.quizzes (cliente_id, criado_em DESC);
CREATE INDEX quizzes_atividade_idx ON public.quizzes (atividade_id);

CREATE TABLE public.quiz_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  respostas jsonb NOT NULL DEFAULT '[]'::jsonb,
  perfil text,
  nome text,
  email text,
  whatsapp text,
  criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_respostas_quiz_idx ON public.quiz_respostas (quiz_id, criada_em DESC);

-- A tarefa do quiz é do mesmo projeto; atualizado_em sempre em dia.
CREATE OR REPLACE FUNCTION public.quiz_confere()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.atividade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atividades WHERE id = NEW.atividade_id AND cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'tarefa não é deste projeto';
  END IF;
  IF NEW.status = 'publicado' AND (TG_OP = 'INSERT' OR OLD.status <> 'publicado') THEN
    IF NEW.estrutura IS NULL OR jsonb_array_length(coalesce(NEW.estrutura->'perguntas', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'quiz sem perguntas não pode ser publicado';
    END IF;
    NEW.publicado_em := coalesce(NEW.publicado_em, now());
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER quiz_confere BEFORE INSERT OR UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.quiz_confere();

-- RLS: área "conteudo" do projeto (dono + equipe).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quizzes', 'quiz_respostas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''acessar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''criar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_update ON public.%I FOR UPDATE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar'')) WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar''))', t, t, t, t, t);
    EXECUTE format('CREATE POLICY team_grant_excluir ON public.%I FOR DELETE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''excluir''))', t, t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT SELECT, DELETE ON public.quiz_respostas TO authenticated;   -- resposta só entra pelo RPC

-- Público: o quiz publicado (sem dados internos) e o envio da resposta.
CREATE OR REPLACE FUNCTION public.quiz_publico(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('titulo', titulo, 'estrutura', estrutura)
    FROM quizzes WHERE slug = p_slug AND status = 'publicado';
$$;

CREATE OR REPLACE FUNCTION public.responder_quiz(p_slug text, p_respostas jsonb, p_perfil text, p_nome text, p_email text, p_whatsapp text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT id, cliente_id INTO q FROM quizzes WHERE slug = p_slug AND status = 'publicado';
  IF NOT FOUND THEN RAISE EXCEPTION 'quiz não encontrado'; END IF;
  IF jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_respostas, '[]'::jsonb)) > 100
     OR length(coalesce(p_respostas::text, '')) > 20000 THEN
    RAISE EXCEPTION 'respostas inválidas';
  END IF;
  INSERT INTO quiz_respostas (quiz_id, cliente_id, respostas, perfil, nome, email, whatsapp)
  VALUES (q.id, q.cliente_id, coalesce(p_respostas, '[]'::jsonb), left(nullif(btrim(p_perfil), ''), 80),
          left(nullif(btrim(p_nome), ''), 120), left(nullif(btrim(p_email), ''), 200), left(nullif(btrim(p_whatsapp), ''), 40));
END;
$$;
REVOKE ALL ON FUNCTION public.quiz_publico(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.responder_quiz(text, jsonb, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quiz_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.responder_quiz(text, jsonb, text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
