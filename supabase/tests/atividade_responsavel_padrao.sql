-- Regressão: tarefa criada no projeto sem responsável fica com quem criou (se
-- for pessoa do projeto), para não sumir do filtro "Só eu". Responsável
-- escolhido é respeitado; insert sem usuário logado (service role) fica vazio.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000801','responsavel-padrao-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000801',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cli uuid; v_sem uuid; v_eu uuid; v_outro uuid; v_id uuid; v_resp uuid; v_nome text;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Responsável teste', 30, 'x', auth.uid()) RETURNING id INTO v_cli;
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Sem membro', 30, 'x', auth.uid()) RETURNING id INTO v_sem;
 INSERT INTO public.membros(cliente_id, user_id, conta_id, nome, ordem) VALUES (v_cli, auth.uid(), auth.uid(), 'Davi', 0) RETURNING id INTO v_eu;
 INSERT INTO public.membros(cliente_id, user_id, nome, ordem) VALUES (v_cli, auth.uid(), 'Junior', 1) RETURNING id INTO v_outro;

 -- Sem responsável: vira quem criou.
 INSERT INTO public.atividades(cliente_id, user_id, titulo, status) VALUES (v_cli, auth.uid(), 'A', 'backlog') RETURNING id INTO v_id;
 SELECT responsavel_id, responsavel_nome INTO v_resp, v_nome FROM public.atividades WHERE id = v_id;
 IF v_resp IS DISTINCT FROM v_eu OR v_nome IS DISTINCT FROM 'Davi' THEN RAISE EXCEPTION 'padrão: % %', v_resp, v_nome; END IF;

 -- Nome vazio ('') também conta como sem responsável.
 INSERT INTO public.atividades(cliente_id, user_id, titulo, status, responsavel_nome) VALUES (v_cli, auth.uid(), 'A2', 'backlog', '') RETURNING id INTO v_id;
 SELECT responsavel_id INTO v_resp FROM public.atividades WHERE id = v_id;
 IF v_resp IS DISTINCT FROM v_eu THEN RAISE EXCEPTION 'nome vazio: %', v_resp; END IF;

 -- Responsável escolhido é respeitado.
 INSERT INTO public.atividades(cliente_id, user_id, titulo, status, responsavel_nome) VALUES (v_cli, auth.uid(), 'B', 'backlog', 'Junior') RETURNING id INTO v_id;
 SELECT responsavel_id INTO v_resp FROM public.atividades WHERE id = v_id;
 IF v_resp IS DISTINCT FROM v_outro THEN RAISE EXCEPTION 'escolhido: %', v_resp; END IF;

 -- Tirar o responsável depois continua possível.
 UPDATE public.atividades SET responsavel_nome = NULL, responsavel_id = NULL WHERE id = v_id;
 SELECT responsavel_id INTO v_resp FROM public.atividades WHERE id = v_id;
 IF v_resp IS NOT NULL THEN RAISE EXCEPTION 'tirar: %', v_resp; END IF;

 -- Projeto em que quem criou não é membro: fica vazio, sem erro.
 INSERT INTO public.atividades(cliente_id, user_id, titulo, status) VALUES (v_sem, auth.uid(), 'C', 'backlog') RETURNING id INTO v_id;
 SELECT responsavel_id INTO v_resp FROM public.atividades WHERE id = v_id;
 IF v_resp IS NOT NULL THEN RAISE EXCEPTION 'sem membro: %', v_resp; END IF;
END $$;
RESET ROLE;
-- Service role (sem usuário logado): não inventa responsável.
SELECT set_config('request.jwt.claim.sub','',true);
DO $$
DECLARE v_cli uuid; v_id uuid; v_resp uuid;
BEGIN
 SELECT id INTO v_cli FROM public.clientes WHERE nome_especialista = 'Responsável teste' AND user_id = '10000000-0000-0000-0000-000000000801';
 INSERT INTO public.atividades(cliente_id, user_id, titulo, status) VALUES (v_cli, '10000000-0000-0000-0000-000000000801', 'D', 'backlog') RETURNING id INTO v_id;
 SELECT responsavel_id INTO v_resp FROM public.atividades WHERE id = v_id;
 IF v_resp IS NOT NULL THEN RAISE EXCEPTION 'service role: %', v_resp; END IF;
END $$;
ROLLBACK;
