-- Esteira: o dono do projeto cria e move peças do próprio escritório; outra pessoa não vê;
-- peça com escritório de outro projeto é recusada.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000e01','est-dono@example.com',now()),
 ('10000000-0000-0000-0000-000000000e02','est-alheio@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000e01',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000e03', 'Esteira', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000e04', 'Outro', 30, 'x', auth.uid());
INSERT INTO public.setores(id, cliente_id, nome) VALUES
 ('10000000-0000-0000-0000-000000000e05', '10000000-0000-0000-0000-000000000e03', 'Lab'),
 ('10000000-0000-0000-0000-000000000e06', '10000000-0000-0000-0000-000000000e04', 'Lab 2');
INSERT INTO public.esteira_itens(id, cliente_id, setor_id, titulo) VALUES
 ('10000000-0000-0000-0000-000000000e07', '10000000-0000-0000-0000-000000000e03', '10000000-0000-0000-0000-000000000e05', 'Ideia do Davi');
UPDATE public.esteira_itens SET etapa = 1, situacao = 'fila' WHERE id = '10000000-0000-0000-0000-000000000e07';
DO $$ BEGIN
  IF (SELECT etapa FROM public.esteira_itens WHERE id = '10000000-0000-0000-0000-000000000e07') <> 1 THEN RAISE EXCEPTION 'não moveu'; END IF;
  BEGIN
    INSERT INTO public.esteira_itens(cliente_id, setor_id, titulo) VALUES ('10000000-0000-0000-0000-000000000e03', '10000000-0000-0000-0000-000000000e06', 'x');
    RAISE EXCEPTION 'aceitou escritório de outro projeto';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Escritório de outro projeto' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.esteira_itens SET textos = '{"x":"y"}' WHERE id = '10000000-0000-0000-0000-000000000e07';
    RAISE EXCEPTION 'o app escreveu os textos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000e02',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.esteira_itens WHERE id = '10000000-0000-0000-0000-000000000e07') THEN RAISE EXCEPTION 'outra pessoa viu a peça'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
