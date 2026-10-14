-- Empresa dentro de cada projeto (etapa 1): Setor → Pessoa → Tarefa.
-- Genérico de propósito: um setor novo (Financeiro, Comercial…) é só uma
-- linha em `setores`. As tarefas são as próprias `atividades`, com colunas
-- novas (todas opcionais, então nada do que já existe muda).
-- Permissão: a mesma da área "atividades" da equipe do projeto.
BEGIN;

CREATE TABLE public.setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  descricao text,
  cor text,
  icone text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX setores_cliente_idx ON public.setores (cliente_id, ordem);

CREATE TABLE public.membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  funcao text,
  responsabilidades text[] NOT NULL DEFAULT '{}',
  avatar_url text,
  -- Conta de login que É esta pessoa (ex.: o Davi): o que for dela aparece
  -- em "Precisa de você". Sem login (a equipe é atualizada pelo Jarvis).
  conta_id uuid,
  eh_ia boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX membros_cliente_idx ON public.membros (cliente_id, ordem);

-- Tarefa da operação = atividade com dono, setor e conteúdo.
ALTER TABLE public.atividades
  ADD COLUMN setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  ADD COLUMN responsavel_id uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  ADD COLUMN proximo_responsavel_id uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  ADD COLUMN video_vertical_id uuid REFERENCES public.videos_vertical(id) ON DELETE SET NULL,
  ADD COLUMN video_youtube_id uuid REFERENCES public.videos_youtube(id) ON DELETE SET NULL,
  ADD COLUMN tipo text,
  -- Onde a tarefa está na fila da pessoa (independe das colunas do quadro,
  -- que no projeto do Davi são dias da semana).
  ADD COLUMN situacao text CHECK (situacao IN ('fila', 'andamento', 'aguardando_aprovacao', 'concluida')),
  ADD COLUMN progresso integer CHECK (progresso BETWEEN 0 AND 100),
  ADD COLUMN observacao text;
CREATE INDEX atividades_responsavel_idx ON public.atividades (responsavel_id) WHERE deleted_at IS NULL;
CREATE INDEX atividades_setor_idx ON public.atividades (setor_id) WHERE deleted_at IS NULL;

CREATE TABLE public.historico_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  cliente_id uuid,
  user_id uuid,
  acao text NOT NULL,
  de_membro_id uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  para_membro_id uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  de_situacao text,
  para_situacao text,
  autor_id uuid DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historico_tarefas_atividade_idx ON public.historico_tarefas (atividade_id, criado_em);

-- Liga o nome escrito em "Responsável" à pessoa cadastrada no projeto (nome
-- igual ou mesmo primeiro nome: "Davi Queiroz" → Davi), e o setor vem da
-- pessoa. Assim a tela de atividades continua igual e já alimenta a empresa.
CREATE OR REPLACE FUNCTION public.atividade_liga_membro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_primeiro text;
  v_membro public.membros%ROWTYPE;
BEGIN
  IF NEW.cliente_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.responsavel_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id) THEN
    -- Escolheu a pessoa: o nome acompanha (telas antigas leem o texto).
    SELECT * INTO v_membro FROM membros WHERE id = NEW.responsavel_id AND cliente_id = NEW.cliente_id;
    IF NOT FOUND THEN NEW.responsavel_id := NULL; RETURN NEW; END IF;
    IF NEW.responsavel_nome IS NULL OR NOT (NEW.responsavel_nome ILIKE '%' || v_membro.nome || '%') THEN
      NEW.responsavel_nome := v_membro.nome;
    END IF;
  ELSIF TG_OP = 'INSERT' OR NEW.responsavel_nome IS DISTINCT FROM OLD.responsavel_nome THEN
    -- Escreveu o nome: acha a pessoa pelo primeiro responsável da lista.
    v_primeiro := lower(btrim(split_part(coalesce(NEW.responsavel_nome, ''), ',', 1)));
    IF v_primeiro = '' THEN
      NEW.responsavel_id := NULL;
    ELSE
      SELECT * INTO v_membro FROM membros
       WHERE cliente_id = NEW.cliente_id AND ativo
         AND (lower(nome) = v_primeiro OR split_part(lower(nome), ' ', 1) = split_part(v_primeiro, ' ', 1))
       ORDER BY (lower(nome) = v_primeiro) DESC, ordem
       LIMIT 1;
      NEW.responsavel_id := CASE WHEN FOUND THEN v_membro.id END;
    END IF;
  END IF;
  IF NEW.responsavel_id IS NOT NULL AND NEW.setor_id IS NULL THEN
    SELECT setor_id INTO NEW.setor_id FROM membros WHERE id = NEW.responsavel_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER atividade_liga_membro BEFORE INSERT OR UPDATE OF responsavel_nome, responsavel_id, cliente_id
  ON public.atividades FOR EACH ROW EXECUTE FUNCTION public.atividade_liga_membro();

-- Histórico: passou de pessoa ou mudou de situação.
CREATE OR REPLACE FUNCTION public.atividade_registra_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id OR NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    INSERT INTO historico_tarefas (atividade_id, cliente_id, user_id, acao, de_membro_id, para_membro_id, de_situacao, para_situacao)
    VALUES (NEW.id, NEW.cliente_id, NEW.user_id,
            CASE WHEN NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN 'passou' ELSE 'situacao' END,
            OLD.responsavel_id, NEW.responsavel_id, OLD.situacao, NEW.situacao);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER atividade_registra_historico AFTER UPDATE OF responsavel_id, situacao
  ON public.atividades FOR EACH ROW EXECUTE FUNCTION public.atividade_registra_historico();

-- RLS: mesmo padrão das tabelas por projeto (colunas_atividade).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['setores', 'membros', 'historico_tarefas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''acessar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''criar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_update ON public.%I FOR UPDATE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''editar'')) WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''editar''))', t, t, t, t, t);
    EXECUTE format('CREATE POLICY team_grant_excluir ON public.%I FOR DELETE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''atividades'', ''excluir''))', t, t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setores, public.membros TO authenticated;
-- Histórico só é escrito pelo gatilho; o app só lê.
GRANT SELECT ON public.historico_tarefas TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
