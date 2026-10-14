-- Regressão: empresa (setores → membros → atividades). Dono cria, nome
-- escrito liga à pessoa, histórico registra a passagem, pessoa de outro
-- projeto não entra, e outra conta não vê nada.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000099','empresa-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000098','empresa-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000099',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cli uuid; v_cli2 uuid; v_setor uuid; v_davi uuid; v_danilo uuid; v_alheio uuid; v_ativ uuid; r record; n int;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Empresa teste', 30, 'x', auth.uid()) RETURNING id INTO v_cli;
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Outro projeto', 30, 'x', auth.uid()) RETURNING id INTO v_cli2;
 INSERT INTO public.setores(cliente_id, nome) VALUES (v_cli, 'Audiovisual') RETURNING id INTO v_setor;
 INSERT INTO public.membros(cliente_id, setor_id, nome, conta_id) VALUES (v_cli, v_setor, 'Davi', auth.uid()) RETURNING id INTO v_davi;
 INSERT INTO public.membros(cliente_id, setor_id, nome) VALUES (v_cli, v_setor, 'Danilo') RETURNING id INTO v_danilo;
 INSERT INTO public.membros(cliente_id, nome) VALUES (v_cli2, 'Danilo') RETURNING id INTO v_alheio;

 -- Nome escrito ("Davi Queiroz") liga ao membro Davi e herda o setor.
 INSERT INTO public.atividades(cliente_id, titulo, status, prioridade, responsavel_nome)
   VALUES (v_cli, 'Gravar roteiro', 'backlog', 'media', 'Davi Queiroz') RETURNING id INTO v_ativ;
 SELECT responsavel_id, setor_id INTO r FROM public.atividades WHERE id = v_ativ;
 IF r.responsavel_id IS DISTINCT FROM v_davi THEN RAISE EXCEPTION 'nome não ligou ao membro'; END IF;
 IF r.setor_id IS DISTINCT FROM v_setor THEN RAISE EXCEPTION 'setor não veio da pessoa'; END IF;

 -- Passar pra outra pessoa: nome acompanha e o histórico registra.
 UPDATE public.atividades SET responsavel_id = v_danilo, situacao = 'fila' WHERE id = v_ativ;
 IF (SELECT responsavel_nome FROM public.atividades WHERE id = v_ativ) <> 'Danilo' THEN RAISE EXCEPTION 'nome não acompanhou'; END IF;
 SELECT count(*) INTO n FROM public.historico_tarefas WHERE atividade_id = v_ativ AND para_membro_id = v_danilo;
 IF n <> 1 THEN RAISE EXCEPTION 'histórico não registrou a passagem (%)', n; END IF;

 -- Pessoa de outro projeto não vira responsável.
 UPDATE public.atividades SET responsavel_id = v_alheio WHERE id = v_ativ;
 IF (SELECT responsavel_id FROM public.atividades WHERE id = v_ativ) IS NOT NULL THEN RAISE EXCEPTION 'aceitou membro de outro projeto'; END IF;

 -- App não escreve histórico direto.
 BEGIN
   INSERT INTO public.historico_tarefas(atividade_id, acao) VALUES (v_ativ, 'forjado');
   RAISE EXCEPTION 'app escreveu histórico';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000098',true);
 IF EXISTS (SELECT 1 FROM public.setores) OR EXISTS (SELECT 1 FROM public.membros) OR EXISTS (SELECT 1 FROM public.historico_tarefas) THEN
   RAISE EXCEPTION 'outra conta vê a empresa alheia';
 END IF;
END $$;
ROLLBACK;
