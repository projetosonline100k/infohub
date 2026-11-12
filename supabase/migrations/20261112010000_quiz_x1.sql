-- X1 do quiz (12/11/2026, Davi: "uma parte chamada X1, onde a gente aborda a pessoa com mensagens padrão ou feitas na hora, visual de WhatsApp,
-- com categorias na lateral"). Guarda cada mensagem de abordagem mandada a um lead e os modelos de mensagem do projeto.
CREATE TABLE public.quiz_abordagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  resposta_id uuid NOT NULL REFERENCES public.quiz_respostas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  texto text NOT NULL CHECK (btrim(texto) <> '' AND length(texto) <= 4000),
  modelo text,
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp')),
  enviada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_abordagens_quiz_idx ON public.quiz_abordagens (quiz_id, enviada_em DESC);
CREATE INDEX quiz_abordagens_lead_idx ON public.quiz_abordagens (resposta_id, enviada_em);

CREATE TABLE public.quiz_modelos_abordagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 60),
  texto text NOT NULL CHECK (btrim(texto) <> '' AND length(texto) <= 4000),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_modelos_abordagem_cliente_idx ON public.quiz_modelos_abordagem (cliente_id, criado_em);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz_abordagens', 'quiz_modelos_abordagem'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''acessar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''criar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_update ON public.%I FOR UPDATE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar'')) WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar''))', t, t, t, t, t);
    EXECUTE format('CREATE POLICY team_grant_excluir ON public.%I FOR DELETE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''excluir''))', t, t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, DELETE ON public.quiz_abordagens TO authenticated;          -- mensagem registrada não se edita
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_modelos_abordagem TO authenticated;

-- A abordagem é do mesmo projeto do lead.
CREATE OR REPLACE FUNCTION public.quiz_abordagem_confere()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM quiz_respostas r WHERE r.id = NEW.resposta_id AND r.quiz_id = NEW.quiz_id AND r.cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'lead não é deste quiz';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER quiz_abordagem_confere BEFORE INSERT ON public.quiz_abordagens FOR EACH ROW EXECUTE FUNCTION public.quiz_abordagem_confere();

NOTIFY pgrst, 'reload schema';
