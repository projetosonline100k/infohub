-- Roteiro do Instalivros pronto (sai de Criando roteiro para Gravação) → uma tarefa do Junior
-- no projeto Davi Queiroz para adaptar; só uma por roteiro, sem roteiro não dispara, e card de
-- outro projeto não dispara. Roda como o Davi (dono dos dois projetos) e desfaz tudo no fim.
BEGIN;
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::text FROM public.clientes WHERE id = 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3'), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  c_instalivros constant uuid := 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3';
  c_davi constant uuid := 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';
  v_video uuid; v_vazio uuid; v_davi uuid; v_tarefa record; n int;
BEGIN
  INSERT INTO public.videos_vertical (cliente_id, titulo, status, ordem, roteiro)
    VALUES (c_instalivros, 'Teste adaptação', 'roteiro', 999, '<p>3 livros que mudam o seu foco</p>') RETURNING id INTO v_video;
  INSERT INTO public.videos_vertical (cliente_id, titulo, status, ordem, roteiro)
    VALUES (c_instalivros, 'Teste sem roteiro', 'roteiro', 999, '<p></p>') RETURNING id INTO v_vazio;
  INSERT INTO public.videos_vertical (cliente_id, titulo, status, ordem, roteiro)
    VALUES (c_davi, 'Teste do Davi', 'roteiro', 999, '<p>texto</p>') RETURNING id INTO v_davi;

  UPDATE public.videos_vertical SET status = 'gravacao' WHERE id IN (v_video, v_vazio, v_davi);
  SELECT a.cliente_id, a.situacao, a.concluida, lower(m.nome) membro, a.descricao INTO v_tarefa
    FROM public.atividades a JOIN public.membros m ON m.id = a.responsavel_id WHERE a.video_vertical_id = v_video;
  IF v_tarefa.cliente_id IS DISTINCT FROM c_davi OR v_tarefa.membro <> 'junior' OR v_tarefa.situacao <> 'fila' OR v_tarefa.concluida THEN
    RAISE EXCEPTION 'tarefa de adaptação errada: %', v_tarefa;
  END IF;
  IF v_tarefa.descricao NOT LIKE 'ADAPTAR:' || v_video || '%' THEN RAISE EXCEPTION 'sem a marca ADAPTAR: %', v_tarefa.descricao; END IF;

  -- Voltar e marcar pronto de novo (mesmo com a tarefa concluída) não duplica.
  UPDATE public.atividades SET concluida = true, situacao = 'concluida' WHERE video_vertical_id = v_video;
  UPDATE public.videos_vertical SET status = 'roteiro' WHERE id = v_video;
  UPDATE public.videos_vertical SET status = 'gravacao' WHERE id = v_video;
  SELECT count(*) INTO n FROM public.atividades WHERE descricao LIKE 'ADAPTAR:' || v_video || '%';
  IF n <> 1 THEN RAISE EXCEPTION 'duplicou a adaptação (%)', n; END IF;

  SELECT count(*) INTO n FROM public.atividades WHERE video_vertical_id IN (v_vazio, v_davi);
  IF n <> 0 THEN RAISE EXCEPTION 'disparou sem roteiro ou fora do Instalivros (%)', n; END IF;
END $$;
ROLLBACK;
