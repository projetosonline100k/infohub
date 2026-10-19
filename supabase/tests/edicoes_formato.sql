-- Regressão: formato da edição — dono vê as opções e escolhe (formato + status);
-- formato fora da lista é recusado; outra conta não escolhe; imagem de exemplo
-- só sobe com o token certo.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000329','edfmt-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000328','edfmt-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000329',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-0000000003c1', 'Formato teste', 30, 'x', auth.uid());
RESET ROLE;
INSERT INTO public.edicoes_video(id, cliente_id, titulo, status, opcoes_formato, token_envio)
 VALUES ('10000000-0000-0000-0000-0000000003e1', '10000000-0000-0000-0000-0000000003c1', 'Vídeo', 'escolher_formato',
         '{"classico": "a", "papel": "b"}', '10000000-0000-0000-0000-0000000003f1');
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
 IF (SELECT opcoes_formato->>'papel' FROM public.edicoes_video WHERE id = '10000000-0000-0000-0000-0000000003e1') <> 'b' THEN
   RAISE EXCEPTION 'dono não vê as opções';
 END IF;
 UPDATE public.edicoes_video SET formato = 'papel', status = 'na_fila' WHERE id = '10000000-0000-0000-0000-0000000003e1';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 1 THEN RAISE EXCEPTION 'dono não escolheu o formato'; END IF;
 UPDATE public.edicoes_video SET formato = 'dark' WHERE id = '10000000-0000-0000-0000-0000000003e1';
 BEGIN
   UPDATE public.edicoes_video SET formato = 'outro' WHERE id = '10000000-0000-0000-0000-0000000003e1';
   RAISE EXCEPTION 'formato inválido aceito';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF NOT public.edicao_envio_permitido('10000000-0000-0000-0000-0000000003c1/10000000-0000-0000-0000-0000000003e1/10000000-0000-0000-0000-0000000003f1/formato-papel.jpg')
 THEN RAISE EXCEPTION 'imagem do formato recusada'; END IF;
 IF public.edicao_envio_permitido('10000000-0000-0000-0000-0000000003c1/10000000-0000-0000-0000-0000000003e1/10000000-0000-0000-0000-0000000003f2/formato-papel.jpg')
 THEN RAISE EXCEPTION 'imagem com token errado aceita'; END IF;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000328',true);
 UPDATE public.edicoes_video SET formato = 'classico' WHERE id = '10000000-0000-0000-0000-0000000003e1';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'outra conta escolheu o formato'; END IF;
END $$;
ROLLBACK;
