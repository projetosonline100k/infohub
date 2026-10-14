-- Regressão: vídeo entra em "edicao" → tarefa do responsável (uma só, mesmo
-- movendo de novo), na pasta "Operação de conteúdo"; outra conta não vê regras.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000119','auto-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000118','auto-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000119',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cli uuid; v_danilo uuid; v_video uuid; v_tarefa record; n int;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Auto teste', 30, 'x', auth.uid()) RETURNING id INTO v_cli;
 INSERT INTO public.membros(cliente_id, nome) VALUES (v_cli, 'Danilo') RETURNING id INTO v_danilo;
 INSERT INTO public.automacoes_conteudo(cliente_id, etapa, responsavel_id, tipo, titulo_modelo, prazo_dias)
   VALUES (v_cli, 'edicao', v_danilo, 'edicao', 'Editar: {titulo}', 2);
 INSERT INTO public.videos_vertical(cliente_id, titulo, status, ordem) VALUES (v_cli, 'Vídeo X', 'gravacao', 0) RETURNING id INTO v_video;

 UPDATE public.videos_vertical SET status = 'edicao' WHERE id = v_video;
 SELECT a.titulo, a.responsavel_id, a.situacao, a.data_vencimento, p.nome pasta INTO v_tarefa
   FROM public.atividades a JOIN public.pastas_atividade p ON p.id = a.pasta_id WHERE a.video_vertical_id = v_video;
 IF v_tarefa.titulo IS DISTINCT FROM 'Editar: Vídeo X' OR v_tarefa.responsavel_id IS DISTINCT FROM v_danilo THEN RAISE EXCEPTION 'tarefa errada: %', v_tarefa; END IF;
 IF v_tarefa.data_vencimento <> current_date + 2 OR v_tarefa.pasta <> 'Operação de conteúdo' THEN RAISE EXCEPTION 'prazo/pasta errados: %', v_tarefa; END IF;

 -- Voltar e avançar de novo não duplica.
 UPDATE public.videos_vertical SET status = 'gravacao' WHERE id = v_video;
 UPDATE public.videos_vertical SET status = 'edicao' WHERE id = v_video;
 SELECT count(*) INTO n FROM public.atividades WHERE video_vertical_id = v_video;
 IF n <> 1 THEN RAISE EXCEPTION 'duplicou a tarefa (%)', n; END IF;

 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000118',true);
 IF EXISTS (SELECT 1 FROM public.automacoes_conteudo) THEN RAISE EXCEPTION 'outra conta vê regras alheias'; END IF;
END $$;
ROLLBACK;
