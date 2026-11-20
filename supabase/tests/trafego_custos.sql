-- Regressão: o dono guarda os custos do projeto (uma linha por projeto); porcentagem acima de 100 e valor negativo são recusados; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000371','tc-dono@example.com',now()), ('10000000-0000-0000-0000-000000000372','tc-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000371',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000373', 'TC', 30, 'x', '10000000-0000-0000-0000-000000000371');
SET LOCAL ROLE authenticated;
INSERT INTO public.trafego_custos(cliente_id, taxa_plataforma_pct, imposto_pct, outros_custos_dia) VALUES ('10000000-0000-0000-0000-000000000373', 4.99, 6, 20);
DO $$
BEGIN
  INSERT INTO public.trafego_custos(cliente_id, taxa_plataforma_pct, imposto_pct, outros_custos_dia) VALUES ('10000000-0000-0000-0000-000000000373', 5, 7, 30)
    ON CONFLICT (cliente_id) DO UPDATE SET taxa_plataforma_pct = EXCLUDED.taxa_plataforma_pct, imposto_pct = EXCLUDED.imposto_pct, outros_custos_dia = EXCLUDED.outros_custos_dia;
  IF (SELECT count(*) FROM public.trafego_custos) <> 1 OR (SELECT taxa_plataforma_pct FROM public.trafego_custos) <> 5 THEN RAISE EXCEPTION 'não atualizou o mesmo projeto'; END IF;
  IF (SELECT user_id FROM public.trafego_custos) IS DISTINCT FROM '10000000-0000-0000-0000-000000000371'::uuid THEN RAISE EXCEPTION 'não carimbou o dono'; END IF;
  BEGIN UPDATE public.trafego_custos SET taxa_plataforma_pct = 101; RAISE EXCEPTION 'aceitou taxa acima de 100';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.trafego_custos SET outros_custos_dia = -1; RAISE EXCEPTION 'aceitou negativo';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000372',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.trafego_custos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu'; END IF; END $$;
RESET ROLE;
ROLLBACK;
