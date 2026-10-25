-- Roteiro do Instalivros vira versão do Davi (25/10/2026, Davi por voz): "os conteúdos do
-- Instalivros combinam com o meu perfil; sempre que um roteiro deles ficar pronto, um agente
-- cria uma versão adaptada para o @eu.daviqueiroz, que aparece na minha Vertical para eu aprovar".
--
-- Pronto = o card do Instalivros sai de "Ideias"/"Criando roteiro" para Gravação (ou adiante)
-- com o roteiro escrito. Aí entra uma tarefa do Junior (projeto Davi Queiroz) na fila; o fluxo
-- de execução do ouvinte pega e ele adapta com scripts/empresa/adaptacao.py, que cria o card
-- "Aguardando aprovação" na Vertical do Davi.
-- Uma vez por roteiro: se já houve tarefa (mesmo apagada ou concluída) ou já existe a versão
-- do Davi, não cria outra. Sem tabela nem coluna nova: a marca ADAPTAR:<id> fica na descrição
-- da tarefa e a versão do Davi aponta para o original por ideia_origem_id.

CREATE OR REPLACE FUNCTION public.instalivros_adaptar_para_davi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_instalivros constant uuid := 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3';
  c_davi constant uuid := 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';
  v_membro uuid;
  v_setor uuid;
  v_dono uuid;
  v_coluna text;
BEGIN
  IF NEW.cliente_id <> c_instalivros OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('gravacao', 'edicao', 'postado') OR OLD.status NOT IN ('ideia', 'roteiro')
     OR coalesce(btrim(regexp_replace(NEW.roteiro, '<[^>]+>', '', 'g')), '') = '' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM atividades WHERE cliente_id = c_davi AND descricao LIKE 'ADAPTAR:' || NEW.id || '%')
     OR EXISTS (SELECT 1 FROM videos_vertical WHERE cliente_id = c_davi AND ideia_origem_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT id, setor_id INTO v_membro, v_setor FROM membros
   WHERE cliente_id = c_davi AND lower(nome) = 'junior' AND ativo AND eh_ia LIMIT 1;
  IF v_membro IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_dono FROM clientes WHERE id = c_davi;
  SELECT status_key INTO v_coluna FROM colunas_atividade
   WHERE cliente_id = c_davi AND NOT eh_conclusao ORDER BY ordem LIMIT 1;
  INSERT INTO atividades (cliente_id, user_id, titulo, status, prioridade, concluida, ordem, data_atividade,
                          responsavel_id, setor_id, tipo, situacao, video_vertical_id, descricao)
  VALUES (c_davi, v_dono, left('Adaptar para o Davi: ' || NEW.titulo, 300), coalesce(v_coluna, 'backlog'), 'media', false, 0,
          current_date, v_membro, v_setor, 'copy', 'fila', NEW.id,
          'ADAPTAR:' || NEW.id || E'\nRoteiro do Instalivros pronto: adaptar para o perfil do Davi (@eu.daviqueiroz).'
          || E'\nVeja tudo com scripts/empresa/adaptacao.py contexto <esta tarefa> (não use o entregar).');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.instalivros_adaptar_para_davi() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER instalivros_adaptar_para_davi AFTER UPDATE OF status ON public.videos_vertical
  FOR EACH ROW EXECUTE FUNCTION public.instalivros_adaptar_para_davi();
