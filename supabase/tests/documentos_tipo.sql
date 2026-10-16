-- Regressão: `documentos.tipo` sai do prefixo do conteúdo e acompanha a edição.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000132','documentos-tipo-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000132',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cli uuid; v_doc uuid; v_tipo text;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Tipo teste', 30, 'x', auth.uid()) RETURNING id INTO v_cli;

 INSERT INTO public.documentos(cliente_id, user_id, titulo, conteudo) VALUES (v_cli, auth.uid(), 'N', '__NOTA_RAPIDA_V1__<p>oi</p>') RETURNING tipo INTO v_tipo;
 IF v_tipo IS DISTINCT FROM 'nota' THEN RAISE EXCEPTION 'nota: %', v_tipo; END IF;
 INSERT INTO public.documentos(cliente_id, user_id, titulo, conteudo) VALUES (v_cli, auth.uid(), 'N2', '<p>__NOTA_RAPIDA_V1__</p><p>oi</p>') RETURNING tipo INTO v_tipo;
 IF v_tipo IS DISTINCT FROM 'nota' THEN RAISE EXCEPTION 'nota corrompida: %', v_tipo; END IF;
 INSERT INTO public.documentos(cliente_id, user_id, titulo, conteudo) VALUES (v_cli, auth.uid(), 'M', '__CANVASMENTAL_V1__{}') RETURNING tipo INTO v_tipo;
 IF v_tipo IS DISTINCT FROM 'mapa' THEN RAISE EXCEPTION 'mapa: %', v_tipo; END IF;
 INSERT INTO public.documentos(cliente_id, user_id, titulo, conteudo) VALUES (v_cli, auth.uid(), 'C', '__CADERNO_V1__{}') RETURNING tipo INTO v_tipo;
 IF v_tipo IS DISTINCT FROM 'caderno' THEN RAISE EXCEPTION 'caderno: %', v_tipo; END IF;
 INSERT INTO public.documentos(cliente_id, user_id, titulo) VALUES (v_cli, auth.uid(), 'D') RETURNING id, tipo INTO v_doc, v_tipo;
 IF v_tipo IS DISTINCT FROM 'documento' THEN RAISE EXCEPTION 'sem conteúdo: %', v_tipo; END IF;

 -- Muda junto com o conteúdo.
 UPDATE public.documentos SET conteudo = '__NOTA_RAPIDA_V1__x' WHERE id = v_doc;
 SELECT tipo INTO v_tipo FROM public.documentos WHERE id = v_doc;
 IF v_tipo IS DISTINCT FROM 'nota' THEN RAISE EXCEPTION 'update: %', v_tipo; END IF;
END $$;
ROLLBACK;
