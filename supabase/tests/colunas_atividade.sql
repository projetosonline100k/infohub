-- Regressão: criar/renomear/excluir coluna do kanban e isolamento entre contas.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000093','coluna-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000092','coluna-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000093',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_coluna uuid; v_atividade uuid;
BEGIN
 INSERT INTO public.colunas_atividade(nome, status_key, ordem)
 VALUES ('Backlog','backlog',0) RETURNING id INTO v_coluna;
 IF v_coluna IS NULL THEN RAISE EXCEPTION 'Coluna não retornou id'; END IF;

 INSERT INTO public.atividades(titulo,status) VALUES ('Tarefa na coluna','backlog') RETURNING id INTO v_atividade;

 UPDATE public.colunas_atividade SET nome = 'Fila de espera' WHERE id = v_coluna;
 IF NOT EXISTS (SELECT 1 FROM public.colunas_atividade WHERE id = v_coluna AND nome = 'Fila de espera') THEN
   RAISE EXCEPTION 'Não conseguiu renomear a coluna';
 END IF;

 DELETE FROM public.colunas_atividade WHERE id = v_coluna;
 IF EXISTS (SELECT 1 FROM public.colunas_atividade WHERE id = v_coluna) THEN
   RAISE EXCEPTION 'Não conseguiu excluir a coluna';
 END IF;
 -- Excluir a coluna não deve apagar a tarefa (só o vínculo de exibição some).
 IF NOT EXISTS (SELECT 1 FROM public.atividades WHERE id = v_atividade) THEN
   RAISE EXCEPTION 'Tarefa foi apagada junto com a coluna';
 END IF;
END $$;

-- Isolamento: outra conta não enxerga nem mexe na coluna de terceiro.
INSERT INTO public.colunas_atividade(nome, status_key, ordem) VALUES ('Pessoal', 'pessoal', 0);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000092',true);

DO $$
DECLARE v_coluna uuid; changed integer;
BEGIN
 SELECT id INTO v_coluna FROM public.colunas_atividade WHERE nome = 'Pessoal';
 IF v_coluna IS NOT NULL THEN RAISE EXCEPTION 'Outra conta enxergou coluna privada'; END IF;

 UPDATE public.colunas_atividade SET nome = 'Invadido' WHERE nome = 'Pessoal';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Outra conta conseguiu renomear coluna privada'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
