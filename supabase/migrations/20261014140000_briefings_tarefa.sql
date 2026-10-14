-- Conversa antes da tarefa (pedido do Davi, 14/10/2026): "a tarefa tem que
-- ser como se eu tivesse conversando com ele ... quando ela me confirmar que
-- entendeu a atividade e eu entender que ela entendeu mesmo, aí sim a
-- atividade sobe e ela começa a fazer".
--
-- Um briefing por pedido: o Davi escreve, o funcionário (Claude em segundo
-- plano, pelo ouvinte do Jarvis) pergunta o que falta e diz se consegue
-- fazer. Quando está claro, ele grava a `proposta` (o que entendeu). O Davi
-- confirma no app e só aí nasce a atividade, com o briefing na descrição.
-- Vale para todo funcionário: para uma pessoa (eh_ia = false) o Claude ajuda
-- a detalhar o pedido em nome dela.

CREATE TABLE public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  membro_id uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'conversando' CHECK (status IN ('conversando', 'confirmado', 'cancelado')),
  -- {titulo, entendimento, entregas[], consigo: sim|em_parte|nao, limites, precisa_de[], prazo_sugerido, tipo}
  proposta jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX briefings_membro_idx ON public.briefings (membro_id, status);

CREATE TABLE public.briefing_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id uuid NOT NULL REFERENCES public.briefings(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  papel text NOT NULL CHECK (papel IN ('davi', 'funcionario')),
  texto text NOT NULL CHECK (btrim(texto) <> ''),
  -- Mensagem do Davi: enviada → lida (ouvinte pegou) → respondida.
  status text CHECK (status IN ('enviada', 'lida', 'respondida')),
  criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX briefing_mensagens_idx ON public.briefing_mensagens (briefing_id, criada_em);
CREATE INDEX briefing_mensagens_fila_idx ON public.briefing_mensagens (criada_em) WHERE status = 'enviada';

-- Mensagem herda o projeto do briefing; a do Davi entra como 'enviada'.
CREATE OR REPLACE FUNCTION public.briefing_mensagem_prepara()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT cliente_id INTO NEW.cliente_id FROM briefings WHERE id = NEW.briefing_id;
  IF NEW.papel = 'davi' THEN NEW.status := coalesce(NEW.status, 'enviada'); END IF;
  UPDATE briefings SET atualizado_em = now() WHERE id = NEW.briefing_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER briefing_mensagem_prepara BEFORE INSERT ON public.briefing_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.briefing_mensagem_prepara();

-- O funcionário do briefing é do mesmo projeto.
CREATE OR REPLACE FUNCTION public.briefing_confere_membro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM membros WHERE id = NEW.membro_id AND cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'funcionário não é deste projeto';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER briefing_confere_membro BEFORE INSERT OR UPDATE OF membro_id, cliente_id, status, atividade_id
  ON public.briefings FOR EACH ROW EXECUTE FUNCTION public.briefing_confere_membro();

-- RLS: o mesmo da área "atividades" do projeto.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['briefings', 'briefing_mensagens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''acessar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''criar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_update ON public.%I FOR UPDATE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''editar'')) WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''editar''))', t, t, t, t, t);
    EXECUTE format('CREATE POLICY team_grant_excluir ON public.%I FOR DELETE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''excluir''))', t, t, t);
  END LOOP;
END $$;
GRANT SELECT, DELETE ON public.briefings, public.briefing_mensagens TO authenticated;
GRANT INSERT (id, cliente_id, membro_id) ON public.briefings TO authenticated;
-- O app só confirma ou cancela; a proposta é do funcionário (ouvinte).
GRANT UPDATE (status, atividade_id) ON public.briefings TO authenticated;
-- O app só escreve como Davi.
GRANT INSERT (id, briefing_id, cliente_id, papel, texto) ON public.briefing_mensagens TO authenticated;
CREATE POLICY so_davi_pelo_app ON public.briefing_mensagens AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (papel = 'davi');

NOTIFY pgrst, 'reload schema';
