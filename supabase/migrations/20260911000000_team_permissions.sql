-- Membros usam sua própria conta confirmada; cadastrar um e-mail não envia convite.
BEGIN;
ALTER TABLE public.equipe_cliente
  ADD COLUMN email text,
  ADD COLUMN clientes_permitidos uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN permissoes jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX equipe_cliente_email_unique
  ON public.equipe_cliente (cliente_id, lower(trim(email))) WHERE email IS NOT NULL;
ALTER TABLE public.equipe_cliente ADD CONSTRAINT equipe_email_valid
  CHECK (email IS NULL OR (email = lower(trim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));

CREATE FUNCTION public.team_allowed(target uuid, area text, action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = target AND (
      c.user_id = auth.uid() OR (
        action <> 'excluir' AND EXISTS (
          SELECT 1 FROM public.equipe_cliente m
          JOIN public.clientes origin ON origin.id = m.cliente_id
          JOIN auth.users u ON u.id = auth.uid()
          WHERE u.email_confirmed_at IS NOT NULL
            AND lower(u.email) = m.email
            AND origin.user_id = c.user_id
            AND (m.cliente_id = c.id OR c.id = ANY(m.clientes_permitidos))
            AND (
              -- A ficha básica permite navegar até as áreas liberadas.
              (area = 'clientes' AND action = 'acessar' AND EXISTS (
                SELECT 1 FROM jsonb_each(m.permissoes) p WHERE p.value->>'acessar' = 'true'
              )) OR (
                m.permissoes->area->>'acessar' = 'true'
                AND m.permissoes->area->>action = 'true'
              )
            )
        )
      )
    )
  );
$$;

-- Resolve também registros filhos, para impedir acesso por IDs diretos.
CREATE FUNCTION public.team_row_client(table_name text, row_data jsonb)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid;
BEGIN
  IF table_name = 'clientes' THEN RETURN (row_data->>'id')::uuid; END IF;
  target := (row_data->>'cliente_id')::uuid;
  IF target IS NOT NULL THEN RETURN target; END IF;
  IF row_data->>'pesquisa_id' IS NOT NULL THEN
    SELECT cliente_id INTO target FROM public.pesquisas WHERE id = (row_data->>'pesquisa_id')::uuid;
  ELSIF row_data->>'produto_id' IS NOT NULL THEN
    SELECT cliente_id INTO target FROM public.produtos_cliente WHERE id = (row_data->>'produto_id')::uuid;
  ELSIF row_data->>'atividade_id' IS NOT NULL THEN
    SELECT cliente_id INTO target FROM public.atividades WHERE id = (row_data->>'atividade_id')::uuid;
  ELSIF row_data->>'video_id' IS NOT NULL THEN
    SELECT cliente_id INTO target FROM public.videos_vertical WHERE id = (row_data->>'video_id')::uuid;
  ELSIF row_data->>'agente_id' IS NOT NULL THEN
    SELECT cliente_id INTO target FROM public.agentes_ia WHERE id = (row_data->>'agente_id')::uuid;
  END IF;
  RETURN target;
END;
$$;

CREATE FUNCTION public.team_row_allowed(table_name text, row_data jsonb, area text, action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid;
BEGIN
  target := public.team_row_client(table_name, row_data);
  IF target IS NULL THEN RETURN (row_data->>'user_id')::uuid = auth.uid(); END IF;
  IF table_name = 'clientes' AND action = 'criar' THEN
    RETURN (row_data->>'user_id')::uuid = auth.uid();
  END IF;
  IF table_name = 'equipe_cliente' THEN
    RETURN EXISTS (SELECT 1 FROM public.clientes WHERE id = target AND user_id = auth.uid());
  END IF;
  RETURN public.team_allowed(target, area, action);
END;
$$;

CREATE FUNCTION public.validate_team_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE owner_id uuid; area text; permission jsonb;
BEGIN
  SELECT user_id INTO owner_id FROM public.clientes WHERE id = NEW.cliente_id;
  IF owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente o proprietário pode gerenciar a equipe'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.clientes_permitidos) selected(id)
    LEFT JOIN public.clientes c ON c.id = selected.id
    WHERE c.id IS NULL OR c.user_id IS DISTINCT FROM owner_id) THEN
    RAISE EXCEPTION 'Cliente não pertence à mesma conta';
  END IF;
  IF jsonb_typeof(NEW.permissoes) <> 'object' THEN RAISE EXCEPTION 'Permissões inválidas'; END IF;
  FOR area, permission IN SELECT * FROM jsonb_each(NEW.permissoes) LOOP
    IF area NOT IN ('clientes', 'pesquisa', 'documentos', 'conteudo', 'atividades', 'produtos')
      OR jsonb_typeof(permission) <> 'object' THEN RAISE EXCEPTION 'Área inválida'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(permission) p WHERE p.key NOT IN ('acessar','criar','editar') OR jsonb_typeof(p.value) <> 'boolean') THEN
      RAISE EXCEPTION 'Permissão inválida';
    END IF;
    IF (permission->>'criar' = 'true' OR permission->>'editar' = 'true') AND permission->>'acessar' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Criar e editar exigem acesso';
    END IF;
  END LOOP;
  NEW.email := nullif(lower(trim(NEW.email)), '');
  NEW.user_id := owner_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_team_member BEFORE INSERT OR UPDATE ON public.equipe_cliente
  FOR EACH ROW EXECUTE FUNCTION public.validate_team_member();

-- Registros compartilhados continuam pertencendo ao proprietário do cliente.
CREATE FUNCTION public.team_stamp_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid; owner_id uuid;
BEGIN
  target := public.team_row_client(TG_TABLE_NAME, to_jsonb(NEW));
  IF TG_TABLE_NAME = 'clientes' AND TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
  ELSIF target IS NOT NULL THEN
    SELECT user_id INTO owner_id FROM public.clientes WHERE id = target;
    NEW.user_id := owner_id;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.user_id := OLD.user_id;
  ELSE
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Uma política restritiva evita que políticas permissivas antigas contornem as permissões.
DO $$
DECLARE entry record; action_entry record; condition text;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('clientes','clientes'), ('equipe_cliente','clientes'),
    ('pesquisas','pesquisa'), ('perguntas_pesquisa','pesquisa'), ('respostas_pesquisa','pesquisa'),
    ('documentos','documentos'), ('atividades','atividades'), ('subtarefas_atividade','atividades'),
    ('produtos_cliente','produtos'), ('produto_financeiro','produtos'), ('produto_financeiro_diario','produtos'),
    ('funil_categorias','produtos'), ('funil_vendas','produtos'),
    ('agentes_ia','conteudo'), ('conhecimentos_agente','conteudo'), ('categorias_nucleo','conteudo'),
    ('ideias_conteudo','conteudo'), ('nucleo_influencia','conteudo'), ('perfis_parecidos','conteudo'),
    ('tags_video','conteudo'), ('termos_virais','conteudo'), ('videos_referencia','conteudo'),
    ('videos_vertical','conteudo'), ('videos_vertical_tags','conteudo'), ('videos_youtube','conteudo')
  ) mapping(table_name, area) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', entry.table_name);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = entry.table_name AND column_name = 'user_id') THEN
      EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', entry.table_name);
    END IF;
    -- Preserva somente leitura das pesquisas públicas e envio de respostas anônimas.
    EXECUTE format('CREATE POLICY team_anon_read ON public.%I AS RESTRICTIVE FOR SELECT TO anon USING (%L)', entry.table_name, entry.table_name IN ('pesquisas','perguntas_pesquisa'));
    EXECUTE format('CREATE POLICY team_anon_insert ON public.%I AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (%L)', entry.table_name, entry.table_name = 'respostas_pesquisa');
    EXECUTE format('CREATE POLICY team_anon_update ON public.%I AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false)', entry.table_name);
    EXECUTE format('CREATE POLICY team_anon_delete ON public.%I AS RESTRICTIVE FOR DELETE TO anon USING (false)', entry.table_name);
    FOR action_entry IN SELECT * FROM (VALUES ('SELECT','acessar'),('INSERT','criar'),('UPDATE','editar'),('DELETE','excluir')) a(command, action) LOOP
      condition := format('public.team_row_allowed(%L, to_jsonb(%I), %L, %L)', entry.table_name, entry.table_name, entry.area, action_entry.action);
      IF action_entry.command = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', 'team_guard_' || action_entry.action, entry.table_name, condition);
        EXECUTE format('CREATE POLICY team_grant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', entry.table_name, condition);
      ELSIF action_entry.command = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY team_guard_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', entry.table_name, condition, condition);
        EXECUTE format('CREATE POLICY team_grant_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', entry.table_name, condition, condition);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated USING (%s)', 'team_guard_' || action_entry.action, entry.table_name, action_entry.command, condition);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s)', 'team_grant_' || action_entry.action, entry.table_name, action_entry.command, condition);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.team_allowed(uuid,text,text), public.team_row_client(text,jsonb), public.team_row_allowed(text,jsonb,text,text), public.validate_team_member(), public.team_stamp_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_allowed(uuid,text,text), public.team_row_allowed(text,jsonb,text,text) TO authenticated;
CREATE FUNCTION public.team_access(target uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'proprietario', EXISTS (SELECT 1 FROM public.clientes WHERE id = target AND user_id = auth.uid()),
    'permissoes', (SELECT jsonb_object_agg(area, jsonb_build_object(
      'acessar', public.team_allowed(target, area, 'acessar'),
      'criar', public.team_allowed(target, area, 'criar'),
      'editar', public.team_allowed(target, area, 'editar')
    )) FROM unnest(ARRAY['clientes','pesquisa','documentos','conteudo','atividades','produtos']) area)
  );
$$;
REVOKE ALL ON FUNCTION public.team_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_access(uuid) TO authenticated;
COMMIT;
