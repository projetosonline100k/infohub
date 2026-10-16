-- Regressão: kanban de melhorias do Pedro. O dono vê e move entre Ideias /
-- Pode fazer / Descartada; não marca Fazendo/Feito; não move o que está em
-- Fazendo; ideia pelo app entra como do Davi; outra conta não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000791','pm-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000792','pm-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000791',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000793', 'PM', 30, 'x', auth.uid());
INSERT INTO public.melhorias_sistema(id, cliente_id, titulo, origem) VALUES
 ('10000000-0000-0000-0000-000000000794', '10000000-0000-0000-0000-000000000793', 'Ideia do Davi', 'davi');
UPDATE public.melhorias_sistema SET status = 'pode_fazer' WHERE id = '10000000-0000-0000-0000-000000000794';
-- O Davi acrescenta detalhes (texto ou áudio transcrito).
UPDATE public.melhorias_sistema SET notas = 'quero no topo da tela' WHERE id = '10000000-0000-0000-0000-000000000794';

DO $$
BEGIN
  UPDATE public.melhorias_sistema SET status = 'feito' WHERE id = '10000000-0000-0000-0000-000000000794';
  RAISE EXCEPTION 'app marcou feito';
EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'esse passo é do Pedro' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.melhorias_sistema(cliente_id, titulo, origem) VALUES ('10000000-0000-0000-0000-000000000793', 'X', 'pedro');
  RAISE EXCEPTION 'app criou como Pedro';
EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'pelo app a ideia entra como ideia do Davi' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  UPDATE public.melhorias_sistema SET resultado = 'x' WHERE id = '10000000-0000-0000-0000-000000000794';
  RAISE EXCEPTION 'app escreveu resultado';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- O Pedro (admin) começa: daí o app não move mais.
RESET ROLE;
UPDATE public.melhorias_sistema SET status = 'fazendo' WHERE id = '10000000-0000-0000-0000-000000000794';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT iniciado_em FROM public.melhorias_sistema WHERE id = '10000000-0000-0000-0000-000000000794') IS NULL THEN RAISE EXCEPTION 'sem iniciado_em'; END IF;
  UPDATE public.melhorias_sistema SET status = 'ideia' WHERE id = '10000000-0000-0000-0000-000000000794';
  RAISE EXCEPTION 'app tirou de fazendo';
EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'esse passo é do Pedro' THEN RAISE; END IF;
END $$;

-- Pendência (16/10): o Pedro marca 'pendente' com a lista; o Davi marca os itens e devolve pra "Pode fazer".
RESET ROLE;
UPDATE public.melhorias_sistema SET status = 'pendente', pendencias = '[{"texto":"criar a chave","feito":false}]' WHERE id = '10000000-0000-0000-0000-000000000794';
SET LOCAL ROLE authenticated;
UPDATE public.melhorias_sistema SET pendencias = '[{"texto":"criar a chave","feito":true}]' WHERE id = '10000000-0000-0000-0000-000000000794';
UPDATE public.melhorias_sistema SET status = 'pode_fazer' WHERE id = '10000000-0000-0000-0000-000000000794';
-- Conversa sobre a melhoria (sem tarefa).
INSERT INTO public.membros(id, cliente_id, nome, eh_ia) VALUES ('10000000-0000-0000-0000-000000000796', '10000000-0000-0000-0000-000000000793', 'Pedro', true);
INSERT INTO public.briefings(cliente_id, membro_id, melhoria_id, status) VALUES
 ('10000000-0000-0000-0000-000000000793', '10000000-0000-0000-0000-000000000796', '10000000-0000-0000-0000-000000000794', 'revisando');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000792',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.melhorias_sistema) THEN RAISE EXCEPTION 'outra conta viu'; END IF;
END $$;
ROLLBACK;
