-- Projeto com colunas de dia (como a Core): a data e a coluna da tarefa andam juntas (20261028020000).
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000081','dia-coluna-test@example.com',now());
INSERT INTO public.clientes(id, user_id, nome_especialista, idade, nicho)
VALUES ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Teste dias',30,'teste');
INSERT INTO public.colunas_atividade(cliente_id, user_id, nome, status_key, ordem, eh_conclusao) VALUES
 ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Segunda-feira','backlog',0,false),
 ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Terça-feira','em_progresso',1,false),
 ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','quarta-feira','revisao',2,false),
 ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Finalizado','concluido',3,true);

DO $$
DECLARE s text; d date; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
BEGIN
 -- Nova com data numa quarta (28/10/2026): cai na coluna quarta-feira.
 INSERT INTO public.atividades(id, user_id, cliente_id, titulo, status, data_vencimento)
 VALUES ('30000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081','t1','backlog','2026-10-28');
 SELECT status INTO s FROM public.atividades WHERE id='30000000-0000-0000-0000-000000000081';
 IF s <> 'revisao' THEN RAISE EXCEPTION 'nova com data de quarta foi para %', s; END IF;

 -- Mudou a data para uma terça: vai para Terça-feira.
 UPDATE public.atividades SET data_vencimento='2026-11-03' WHERE id='30000000-0000-0000-0000-000000000081';
 SELECT status INTO s FROM public.atividades WHERE id='30000000-0000-0000-0000-000000000081';
 IF s <> 'em_progresso' THEN RAISE EXCEPTION 'data de terça ficou em %', s; END IF;

 -- Arrastou para a coluna Segunda-feira: a data vira a próxima segunda (contando hoje).
 UPDATE public.atividades SET status='backlog' WHERE id='30000000-0000-0000-0000-000000000081';
 SELECT data_vencimento INTO d FROM public.atividades WHERE id='30000000-0000-0000-0000-000000000081';
 IF extract(dow from d) <> 1 OR d < hoje OR d > hoje + 6 THEN RAISE EXCEPTION 'coluna segunda deu a data %', d; END IF;

 -- Concluída (coluna Finalizado): mudar a data não tira dela.
 UPDATE public.atividades SET status='concluido', concluida=true WHERE id='30000000-0000-0000-0000-000000000081';
 UPDATE public.atividades SET data_vencimento='2026-10-28' WHERE id='30000000-0000-0000-0000-000000000081';
 SELECT status INTO s FROM public.atividades WHERE id='30000000-0000-0000-0000-000000000081';
 IF s <> 'concluido' THEN RAISE EXCEPTION 'concluída saiu para %', s; END IF;

 -- Nova sem data na coluna quarta-feira: ganha a data da próxima quarta.
 INSERT INTO public.atividades(id, user_id, cliente_id, titulo, status)
 VALUES ('30000000-0000-0000-0000-000000000082','10000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081','t2','revisao');
 SELECT data_vencimento INTO d FROM public.atividades WHERE id='30000000-0000-0000-0000-000000000082';
 IF d IS NULL OR extract(dow from d) <> 3 THEN RAISE EXCEPTION 'nova na quarta ganhou a data %', d; END IF;

 -- Trocou de projeto (sem projeto → este), entrando na 1ª coluna (Segunda-feira): a data fica, a coluna é a do dia.
 INSERT INTO public.atividades(id, user_id, cliente_id, titulo, status, data_vencimento)
 VALUES ('30000000-0000-0000-0000-000000000083','10000000-0000-0000-0000-000000000081',NULL,'t3','backlog','2026-10-28');
 UPDATE public.atividades SET cliente_id='20000000-0000-0000-0000-000000000081', status='backlog' WHERE id='30000000-0000-0000-0000-000000000083';
 SELECT status, data_vencimento INTO s, d FROM public.atividades WHERE id='30000000-0000-0000-0000-000000000083';
 IF d <> '2026-10-28' OR s <> 'revisao' THEN RAISE EXCEPTION 'trocar de projeto deu % / %', s, d; END IF;

 -- Data num dia sem coluna (sábado): a coluna fica como estava.
 UPDATE public.atividades SET data_vencimento='2026-10-31' WHERE id='30000000-0000-0000-0000-000000000082';
 SELECT status INTO s FROM public.atividades WHERE id='30000000-0000-0000-0000-000000000082';
 IF s <> 'revisao' THEN RAISE EXCEPTION 'sábado mudou a coluna para %', s; END IF;
END $$;
ROLLBACK;
