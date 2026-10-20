-- Regressão (20/10/2026): no quadro com colunas por dia da semana, repetir "toda semana" gera a
-- cópia na MESMA coluna da original, com a data de uma semana depois ("mesmo dia na semana seguinte").
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000271','repetir-coluna-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000271',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000272', 'Colunas por dia', 30, 'x', '10000000-0000-0000-0000-000000000271');
SET LOCAL ROLE authenticated;
INSERT INTO public.colunas_atividade(cliente_id, nome, status_key, ordem, eh_conclusao) VALUES
 ('10000000-0000-0000-0000-000000000272', 'Segunda-feira', 'seg', 0, false),
 ('10000000-0000-0000-0000-000000000272', 'Terça-feira', 'ter', 1, false),
 ('10000000-0000-0000-0000-000000000272', 'Finalizado', 'fim', 2, true);
-- 07/01/2030 é segunda.
INSERT INTO public.atividades(id, cliente_id, titulo, status, data_atividade, data_vencimento, repetir) VALUES
 ('10000000-0000-0000-0000-000000000273', '10000000-0000-0000-0000-000000000272', 'Headlines', 'seg', '2030-01-07', '2030-01-07', 'semanal');
UPDATE public.atividades SET concluida = true WHERE id = '10000000-0000-0000-0000-000000000273';
DO $$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM public.atividades WHERE titulo = 'Headlines' AND NOT concluida AND cliente_id = '10000000-0000-0000-0000-000000000272';
 IF r.data_vencimento <> '2030-01-14' OR r.status <> 'seg' THEN
   RAISE EXCEPTION 'cópia devia ficar na segunda (seg) da semana seguinte: %', r; END IF;
 IF (SELECT status FROM public.atividades WHERE id = '10000000-0000-0000-0000-000000000273') <> 'fim' THEN
   RAISE EXCEPTION 'a concluída devia ir para Finalizado'; END IF;
END $$;
ROLLBACK;
