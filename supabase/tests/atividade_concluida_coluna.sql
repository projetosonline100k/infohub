-- Regressão: tarefa marcada como concluída (só `concluida = true`, como Roy,
-- Danilo e a execução fazem) vai para a coluna de conclusão do projeto ou das
-- colunas pessoais; sem coluna de conclusão, o status fica como estava.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000131','concluida-coluna-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000131',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cli uuid; v_sem uuid; v_a uuid; v_b uuid; v_c uuid; v_status text;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Coluna teste', 30, 'x', auth.uid()) RETURNING id INTO v_cli;
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Sem conclusão', 30, 'x', auth.uid()) RETURNING id INTO v_sem;
 INSERT INTO public.colunas_atividade(cliente_id, user_id, nome, status_key, ordem, eh_conclusao) VALUES
   (v_cli, auth.uid(), 'Segunda', 'backlog', 0, false),
   (v_cli, auth.uid(), 'Feito', 'concluido', 5, true),
   (v_sem, auth.uid(), 'Segunda', 'backlog', 0, false),
   (NULL, auth.uid(), 'Backlog', 'backlog', 0, false),
   (NULL, auth.uid(), 'Pronto', 'pronto', 3, true);

 INSERT INTO public.atividades(cliente_id, user_id, titulo, status) VALUES (v_cli, auth.uid(), 'A', 'backlog') RETURNING id INTO v_a;
 UPDATE public.atividades SET concluida = true WHERE id = v_a;
 SELECT status INTO v_status FROM public.atividades WHERE id = v_a;
 IF v_status IS DISTINCT FROM 'concluido' THEN RAISE EXCEPTION 'projeto: status %, esperado concluido', v_status; END IF;

 -- Reabrir pelo app (status escolhido junto) é respeitado.
 UPDATE public.atividades SET concluida = false, status = 'backlog' WHERE id = v_a;
 SELECT status INTO v_status FROM public.atividades WHERE id = v_a;
 IF v_status IS DISTINCT FROM 'backlog' THEN RAISE EXCEPTION 'reabrir: status %', v_status; END IF;

 -- Já nasce concluída.
 INSERT INTO public.atividades(cliente_id, user_id, titulo, status, concluida) VALUES (v_cli, auth.uid(), 'B', 'backlog', true) RETURNING id INTO v_b;
 SELECT status INTO v_status FROM public.atividades WHERE id = v_b;
 IF v_status IS DISTINCT FROM 'concluido' THEN RAISE EXCEPTION 'insert: status %', v_status; END IF;

 -- Sem coluna de conclusão: nada muda.
 INSERT INTO public.atividades(cliente_id, user_id, titulo, status) VALUES (v_sem, auth.uid(), 'C', 'backlog') RETURNING id INTO v_c;
 UPDATE public.atividades SET concluida = true WHERE id = v_c;
 SELECT status INTO v_status FROM public.atividades WHERE id = v_c;
 IF v_status IS DISTINCT FROM 'backlog' THEN RAISE EXCEPTION 'sem conclusão: status %', v_status; END IF;

 -- Tarefa pessoal (sem projeto) usa as colunas pessoais do dono.
 INSERT INTO public.atividades(user_id, titulo, status) VALUES (auth.uid(), 'D', 'backlog') RETURNING id INTO v_c;
 UPDATE public.atividades SET concluida = true WHERE id = v_c;
 SELECT status INTO v_status FROM public.atividades WHERE id = v_c;
 IF v_status IS DISTINCT FROM 'pronto' THEN RAISE EXCEPTION 'pessoal: status %', v_status; END IF;
END $$;
RESET ROLE;
ROLLBACK;
