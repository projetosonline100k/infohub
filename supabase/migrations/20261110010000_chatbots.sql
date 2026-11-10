-- Chatbot por projeto (10/11/2026, Davi: "um sistema abaixo do WhatsApp chamado Chatbot, para eu criar um
-- diagnóstico em conversa, idêntico ao da Core Audience"). A conversa (etapas, perguntas, pontuação, desfechos)
-- é montada na aba Chatbot e publicada em /chatbot/<slug>. Cada resposta chega por RPC (anon), etapa a etapa,
-- então quem sai no meio também vira lead.
CREATE TABLE public.chatbots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  slug text NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10) CHECK (slug ~ '^[a-z0-9-]{4,60}$'),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'pausado')),
  -- {marca:{titulo,avatar_url,logo_url,cor}, etapas:[{id,chave,mensagens[],tipo,rotulo,placeholder,opcoes[{texto,pontos}]}],
  --  pontuacao:{minimo}, desfechos:{qualificado:{mensagens[],botao},nao_qualificado:{...}}, lgpd}
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chatbots_cliente_idx ON public.chatbots (cliente_id, criado_em DESC);

CREATE TABLE public.chatbot_leads (
  id uuid PRIMARY KEY,
  chatbot_id uuid NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  etapa int NOT NULL DEFAULT 0,
  score int NOT NULL DEFAULT 0,
  desfecho text,
  nome text,
  email text,
  whatsapp text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chatbot_leads_bot_idx ON public.chatbot_leads (chatbot_id, criada_em DESC);

CREATE OR REPLACE FUNCTION public.chatbot_confere()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'publicado' AND jsonb_array_length(coalesce(NEW.config->'etapas', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'chatbot sem etapas não pode ser publicado';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER chatbot_confere BEFORE INSERT OR UPDATE ON public.chatbots FOR EACH ROW EXECUTE FUNCTION public.chatbot_confere();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chatbots', 'chatbot_leads'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''acessar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''criar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_update ON public.%I FOR UPDATE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar'')) WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar''))', t, t, t, t, t);
    EXECUTE format('CREATE POLICY team_grant_excluir ON public.%I FOR DELETE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''excluir''))', t, t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbots TO authenticated;
GRANT SELECT, DELETE ON public.chatbot_leads TO authenticated;   -- lead só entra pelo RPC

-- Público: o chatbot publicado e o salvamento do lead (a cada etapa, pelo mesmo id).
CREATE OR REPLACE FUNCTION public.chatbot_publico(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nome', nome, 'config', config) FROM chatbots WHERE slug = p_slug AND status = 'publicado';
$$;

CREATE OR REPLACE FUNCTION public.chatbot_salvar_lead(p_slug text, p_lead uuid, p_dados jsonb, p_etapa int, p_score int, p_desfecho text, p_utm jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  SELECT id, cliente_id INTO b FROM chatbots WHERE slug = p_slug AND status = 'publicado';
  IF NOT FOUND THEN RAISE EXCEPTION 'chatbot não encontrado'; END IF;
  IF jsonb_typeof(coalesce(p_dados, '{}'::jsonb)) <> 'object' OR length(coalesce(p_dados::text, '')) > 20000
     OR jsonb_typeof(coalesce(p_utm, '{}'::jsonb)) <> 'object' OR length(coalesce(p_utm::text, '')) > 4000 THEN
    RAISE EXCEPTION 'dados inválidos';
  END IF;
  INSERT INTO chatbot_leads (id, chatbot_id, cliente_id, dados, etapa, score, desfecho, nome, email, whatsapp, utm)
  VALUES (p_lead, b.id, b.cliente_id, coalesce(p_dados, '{}'::jsonb), greatest(coalesce(p_etapa, 0), 0), coalesce(p_score, 0),
          left(nullif(btrim(p_desfecho), ''), 40), left(nullif(btrim(p_dados->>'nome'), ''), 120),
          left(nullif(btrim(p_dados->>'email'), ''), 200), left(nullif(btrim(p_dados->>'whatsapp'), ''), 40), coalesce(p_utm, '{}'::jsonb))
  ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, etapa = EXCLUDED.etapa, score = EXCLUDED.score, desfecho = EXCLUDED.desfecho,
    nome = EXCLUDED.nome, email = EXCLUDED.email, whatsapp = EXCLUDED.whatsapp, atualizada_em = now()
    WHERE chatbot_leads.chatbot_id = b.id;
END;
$$;
REVOKE ALL ON FUNCTION public.chatbot_publico(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chatbot_salvar_lead(text, uuid, jsonb, int, int, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chatbot_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chatbot_salvar_lead(text, uuid, jsonb, int, int, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
