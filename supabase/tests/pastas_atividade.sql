-- Regressão: pasta com tarefa, lixeira em cascata, purga e isolamento de outra conta.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000097','pasta-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000096','pasta-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000097',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_pasta uuid; v_atividade uuid; v_subtarefa uuid; changed integer;
BEGIN
 INSERT INTO public.pastas_atividade(nome) VALUES ('Pasta de teste') RETURNING id INTO v_pasta;
 IF v_pasta IS NULL THEN RAISE EXCEPTION 'Pasta não retornou id'; END IF;

 INSERT INTO public.atividades(titulo,pasta_id,responsavel_nome)
 VALUES ('Tarefa da pasta',v_pasta,'Fulano') RETURNING id INTO v_atividade;
 INSERT INTO public.subtarefas_atividade(atividade_id,titulo) VALUES (v_atividade,'Checklist item') RETURNING id INTO v_subtarefa;

 -- "Lixeira": excluir a pasta marca deleted_at nela e em cascata na tarefa.
 UPDATE public.pastas_atividade SET deleted_at = now() WHERE id = v_pasta;
 UPDATE public.atividades SET deleted_at = now() WHERE pasta_id = v_pasta;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Tarefa não foi para a lixeira junto com a pasta'; END IF;

 -- Restaurar.
 UPDATE public.pastas_atividade SET deleted_at = NULL WHERE id = v_pasta;
 UPDATE public.atividades SET deleted_at = NULL WHERE pasta_id = v_pasta;
 IF EXISTS (SELECT 1 FROM public.atividades WHERE id = v_atividade AND deleted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Tarefa não foi restaurada';
 END IF;

 -- Purga definitiva: apagar a pasta remove a tarefa e o item de checklist em cascata.
 DELETE FROM public.pastas_atividade WHERE id = v_pasta;
 IF EXISTS (SELECT 1 FROM public.atividades WHERE id = v_atividade) THEN
   RAISE EXCEPTION 'Tarefa sobreviveu à purga da pasta';
 END IF;
 IF EXISTS (SELECT 1 FROM public.subtarefas_atividade WHERE id = v_subtarefa) THEN
   RAISE EXCEPTION 'Subtarefa sobreviveu à purga da pasta';
 END IF;
END $$;

-- Isolamento: outra conta não enxerga nem exclui pasta de terceiro.
INSERT INTO public.pastas_atividade(nome) VALUES ('Pasta privada');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000096',true);

DO $$
DECLARE v_pasta uuid; changed integer;
BEGIN
 SELECT id INTO v_pasta FROM public.pastas_atividade WHERE nome = 'Pasta privada';
 IF v_pasta IS NOT NULL THEN RAISE EXCEPTION 'Outra conta enxergou pasta privada'; END IF;

 UPDATE public.pastas_atividade SET deleted_at = now() WHERE nome = 'Pasta privada';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta conseguiu excluir pasta privada'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
