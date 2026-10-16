-- Regressão: "falta reiniciar" no kanban do Pedro. O Pedro (admin) grava os
-- serviços; o dono lê; o app não escreve; outra conta não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000811','mr-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000812','mr-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000811',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000813', 'MR', 30, 'x', auth.uid());
RESET ROLE;
INSERT INTO public.melhorias_sistema(id, cliente_id, user_id, titulo, origem, status, reiniciar) VALUES
 ('10000000-0000-0000-0000-000000000814', '10000000-0000-0000-0000-000000000813', '10000000-0000-0000-0000-000000000811', 'Mexe no ouvinte', 'pedro', 'feito', ARRAY['ouvinte']);

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT reiniciar FROM public.melhorias_sistema WHERE id = '10000000-0000-0000-0000-000000000814') IS DISTINCT FROM ARRAY['ouvinte'] THEN
    RAISE EXCEPTION 'dono não vê o reiniciar';
  END IF;
END $$;
DO $$
BEGIN
  UPDATE public.melhorias_sistema SET reiniciar = NULL WHERE id = '10000000-0000-0000-0000-000000000814';
  RAISE EXCEPTION 'app apagou o reiniciar';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000812',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.melhorias_sistema WHERE id = '10000000-0000-0000-0000-000000000814') THEN
    RAISE EXCEPTION 'outra conta viu a melhoria';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
