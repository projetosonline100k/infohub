-- Regressão: o nome do projeto entra e é editado sem espaço nas pontas
-- (foi assim que nasceram o 'Core ' e o 'CORE' duplicados).
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000401','nome-espaco-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000401',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000402', '  Projeto Teste ', 30, 'x', auth.uid());

DO $$
BEGIN
  IF (SELECT nome_especialista FROM public.clientes WHERE id = '10000000-0000-0000-0000-000000000402') <> 'Projeto Teste' THEN
    RAISE EXCEPTION 'nome entrou com espaço';
  END IF;
  UPDATE public.clientes SET nome_especialista = 'Outro Nome  ' WHERE id = '10000000-0000-0000-0000-000000000402';
  IF (SELECT nome_especialista FROM public.clientes WHERE id = '10000000-0000-0000-0000-000000000402') <> 'Outro Nome' THEN
    RAISE EXCEPTION 'edição manteve o espaço';
  END IF;
END $$;
ROLLBACK;
