-- Empresa (etapa 6, começo): automações pelo andamento do vídeo. Quando um
-- vídeo (Vertical ou YouTube) entra numa etapa, cria a tarefa do responsável
-- configurado. Primeira regra (pedido do Davi, 13/10/2026): entrou em
-- "edicao" → tarefa de edição pro Danilo.
--
-- Genérico: cada regra é uma linha (etapa → pessoa, tipo, título, prazo).
-- Roda no banco, então vale de qualquer lugar que mova o vídeo. Não duplica:
-- se o vídeo já tem tarefa aberta do mesmo tipo, não cria outra.
-- As tarefas caem na pasta "Operação de conteúdo" do projeto (criada se faltar).

CREATE TABLE public.automacoes_conteudo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  etapa text NOT NULL,                      -- status do vídeo que dispara (ex.: 'edicao')
  responsavel_id uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  tipo text NOT NULL,                       -- tipo da tarefa (ex.: 'edicao')
  titulo_modelo text NOT NULL DEFAULT '{titulo}',  -- {titulo} = título do vídeo
  prazo_dias integer NOT NULL DEFAULT 2 CHECK (prazo_dias >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automacoes_conteudo_idx ON public.automacoes_conteudo (cliente_id, etapa) WHERE ativo;

CREATE OR REPLACE FUNCTION public.video_dispara_automacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.automacoes_conteudo%ROWTYPE;
  v_dono uuid;
  v_pasta uuid;
  v_coluna text;
  v_eh_youtube boolean := TG_TABLE_NAME = 'videos_youtube';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  FOR r IN SELECT * FROM automacoes_conteudo WHERE cliente_id = NEW.cliente_id AND etapa = NEW.status AND ativo LOOP
    -- Já tem tarefa aberta desse tipo pra esse vídeo? Não cria outra.
    IF EXISTS (SELECT 1 FROM atividades a
               WHERE a.deleted_at IS NULL AND NOT a.concluida AND a.tipo = r.tipo
                 AND (CASE WHEN v_eh_youtube THEN a.video_youtube_id ELSE a.video_vertical_id END) = NEW.id) THEN
      CONTINUE;
    END IF;
    SELECT user_id INTO v_dono FROM clientes WHERE id = NEW.cliente_id;
    SELECT id INTO v_pasta FROM pastas_atividade
     WHERE cliente_id = NEW.cliente_id AND nome = 'Operação de conteúdo' AND deleted_at IS NULL LIMIT 1;
    IF v_pasta IS NULL THEN
      INSERT INTO pastas_atividade (cliente_id, user_id, nome, ordem, origem)
      VALUES (NEW.cliente_id, v_dono, 'Operação de conteúdo', 0, 'atividades') RETURNING id INTO v_pasta;
    END IF;
    SELECT status_key INTO v_coluna FROM colunas_atividade
     WHERE cliente_id = NEW.cliente_id AND NOT eh_conclusao ORDER BY ordem LIMIT 1;
    INSERT INTO atividades (cliente_id, user_id, pasta_id, titulo, status, prioridade, concluida, ordem,
                            data_atividade, data_vencimento, responsavel_id, tipo, situacao,
                            video_vertical_id, video_youtube_id)
    VALUES (NEW.cliente_id, v_dono, v_pasta, replace(r.titulo_modelo, '{titulo}', NEW.titulo),
            coalesce(v_coluna, 'backlog'), 'media', false, 0,
            current_date, current_date + r.prazo_dias, r.responsavel_id, r.tipo, 'fila',
            CASE WHEN v_eh_youtube THEN NULL ELSE NEW.id END, CASE WHEN v_eh_youtube THEN NEW.id END);
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER video_dispara_automacoes AFTER UPDATE OF status ON public.videos_vertical
  FOR EACH ROW EXECUTE FUNCTION public.video_dispara_automacoes();
CREATE TRIGGER video_dispara_automacoes AFTER UPDATE OF status ON public.videos_youtube
  FOR EACH ROW EXECUTE FUNCTION public.video_dispara_automacoes();

-- RLS: mesmo padrão da empresa (área "atividades" da equipe do projeto).
ALTER TABLE public.automacoes_conteudo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automacoes_conteudo FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.automacoes_conteudo
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.automacoes_conteudo FOR SELECT TO authenticated
  USING (public.team_row_allowed('automacoes_conteudo', to_jsonb(automacoes_conteudo.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_insert ON public.automacoes_conteudo FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('automacoes_conteudo', to_jsonb(automacoes_conteudo.*), 'atividades', 'criar'));
CREATE POLICY team_grant_update ON public.automacoes_conteudo FOR UPDATE TO authenticated
  USING (public.team_row_allowed('automacoes_conteudo', to_jsonb(automacoes_conteudo.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('automacoes_conteudo', to_jsonb(automacoes_conteudo.*), 'atividades', 'editar'));
CREATE POLICY team_grant_excluir ON public.automacoes_conteudo FOR DELETE TO authenticated
  USING (public.team_row_allowed('automacoes_conteudo', to_jsonb(automacoes_conteudo.*), 'atividades', 'excluir'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automacoes_conteudo TO authenticated;

-- Primeira regra: projeto Davi Queiroz, entrou em Edição → Danilo, 2 dias.
INSERT INTO public.automacoes_conteudo (cliente_id, user_id, etapa, responsavel_id, tipo, titulo_modelo, prazo_dias)
SELECT m.cliente_id, c.user_id, 'edicao', m.id, 'edicao', 'Editar: {titulo}', 2
FROM public.membros m JOIN public.clientes c ON c.id = m.cliente_id
WHERE m.cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND m.nome = 'Danilo';

NOTIFY pgrst, 'reload schema';
