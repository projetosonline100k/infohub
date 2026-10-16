-- Regressão: concluir tarefa com `repetir` cria a próxima cópia (com o
-- checklist desmarcado), no dia certo da regra, e só uma vez.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000261','repetir-dono-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000261',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000262', 'Repetir teste', 30, 'x', '10000000-0000-0000-0000-000000000261');
SET LOCAL ROLE authenticated;

-- 07/01/2030 é segunda; 11/01/2030 é sexta.
INSERT INTO public.atividades(id, cliente_id, titulo, status, data_atividade, data_vencimento, responsavel_nome, repetir, repetir_dias) VALUES
 ('10000000-0000-0000-0000-000000000263', '10000000-0000-0000-0000-000000000262', 'Semanal', 'backlog', '2030-01-07', '2030-01-07', 'Ana', 'semanal', NULL),
 ('10000000-0000-0000-0000-000000000264', '10000000-0000-0000-0000-000000000262', 'Útil', 'em_progresso', '2030-01-11', '2030-01-11', NULL, 'dias_uteis', NULL),
 ('10000000-0000-0000-0000-000000000265', '10000000-0000-0000-0000-000000000262', 'Ter e qui', 'backlog', '2030-01-07', '2030-01-07', NULL, 'dias', '{2,4}'),
 ('10000000-0000-0000-0000-000000000266', '10000000-0000-0000-0000-000000000262', 'Sem repetir', 'backlog', '2030-01-07', '2030-01-07', NULL, NULL, NULL);
INSERT INTO public.subtarefas_atividade(atividade_id, titulo, concluida, ordem) VALUES
 ('10000000-0000-0000-0000-000000000263', 'Passo 1', true, 0),
 ('10000000-0000-0000-0000-000000000263', 'Passo 2', true, 1);

UPDATE public.atividades SET concluida = true
 WHERE cliente_id = '10000000-0000-0000-0000-000000000262';
-- Reabrir e concluir de novo não gera outra cópia.
UPDATE public.atividades SET concluida = false WHERE id = '10000000-0000-0000-0000-000000000263';
UPDATE public.atividades SET concluida = true WHERE id = '10000000-0000-0000-0000-000000000263';

DO $$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM public.atividades
  WHERE titulo = 'Semanal' AND NOT concluida AND cliente_id = '10000000-0000-0000-0000-000000000262';
 IF r.data_vencimento <> '2030-01-14' OR r.data_atividade <> '2030-01-14' OR r.status <> 'backlog'
    OR r.responsavel_nome <> 'Ana' OR r.repetir <> 'semanal'
    OR r.user_id <> '10000000-0000-0000-0000-000000000261' THEN
   RAISE EXCEPTION 'cópia semanal errada: %', r; END IF;
 IF (SELECT count(*) FROM public.subtarefas_atividade WHERE atividade_id = r.id AND NOT concluida) <> 2 THEN
   RAISE EXCEPTION 'checklist não veio desmarcado'; END IF;
 IF (SELECT count(*) FROM public.atividades WHERE titulo = 'Semanal' AND cliente_id = '10000000-0000-0000-0000-000000000262') <> 2 THEN
   RAISE EXCEPTION 'reconcluir gerou cópia a mais'; END IF;
 IF (SELECT repetir FROM public.atividades WHERE id = '10000000-0000-0000-0000-000000000263') IS NOT NULL THEN
   RAISE EXCEPTION 'regra ficou na concluída'; END IF;

 SELECT * INTO r FROM public.atividades WHERE titulo = 'Útil' AND NOT concluida;
 IF r.data_vencimento <> '2030-01-14' OR r.status <> 'em_progresso' THEN
   RAISE EXCEPTION 'cópia de dia útil errada: %', r; END IF;

 SELECT * INTO r FROM public.atividades WHERE titulo = 'Ter e qui' AND NOT concluida;
 IF r.data_vencimento <> '2030-01-08' THEN
   RAISE EXCEPTION 'cópia de dias escolhidos errada: %', r; END IF;

 IF (SELECT count(*) FROM public.atividades WHERE titulo = 'Sem repetir') <> 1 THEN
   RAISE EXCEPTION 'tarefa sem repetir ganhou cópia'; END IF;
END $$;
ROLLBACK;
