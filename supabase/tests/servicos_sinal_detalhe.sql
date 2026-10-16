-- Regressão: o resultado da rodada da cobrança só é visto pelo dono e o app não grava.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000085','sinal-detalhe-owner@example.com',now()),
 ('10000000-0000-0000-0000-000000000084','sinal-detalhe-outsider@example.com',now());
INSERT INTO public.servicos_sinal(user_id, servico, iniciado_em, detalhe)
VALUES ('10000000-0000-0000-0000-000000000085','cobranca',now(),'publicou: Responde a Bel');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000085',true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.servicos_sinal WHERE servico = 'cobranca' AND detalhe = 'publicou: Responde a Bel') THEN
   RAISE EXCEPTION 'Dono não vê o resultado da cobrança';
 END IF;
 BEGIN
   UPDATE public.servicos_sinal SET detalhe = 'x' WHERE servico = 'cobranca';
   RAISE EXCEPTION 'App conseguiu gravar o resultado';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000084',true);
 IF EXISTS (SELECT 1 FROM public.servicos_sinal WHERE servico = 'cobranca') THEN
   RAISE EXCEPTION 'Outra conta enxerga o resultado alheio';
 END IF;
END $$;

RESET ROLE;
ROLLBACK;
