-- Regressão: "Separar ideias" — numeração por mentorado, só o dono vê,
-- app não forja headline, e o Atalho carimba o mentorado do modo ligado.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000079','ideias-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000078','ideias-outsider-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000079',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_cliente uuid; v_pasta uuid; v_pasta2 uuid; n int;
BEGIN
 INSERT INTO public.clientes(nome_especialista, idade, nicho, user_id) VALUES ('Teste ideias', 30, 'x', auth.uid()) RETURNING id INTO v_cliente;
 INSERT INTO public.pastas_atividade(cliente_id, user_id, nome, origem) VALUES (v_cliente, auth.uid(), 'Mentorada A', 'documentos') RETURNING id INTO v_pasta;
 INSERT INTO public.pastas_atividade(cliente_id, user_id, nome, origem) VALUES (v_cliente, auth.uid(), 'Mentorada B', 'documentos') RETURNING id INTO v_pasta2;
 INSERT INTO public.creator_ideias(pasta_id, link) VALUES (v_pasta, 'https://x/1');
 INSERT INTO public.creator_ideias(pasta_id, link) VALUES (v_pasta, 'https://x/2');
 INSERT INTO public.creator_ideias(pasta_id, link) VALUES (v_pasta2, 'https://y/1');
 SELECT max(numero) INTO n FROM public.creator_ideias WHERE pasta_id = v_pasta;
 IF n <> 2 THEN RAISE EXCEPTION 'numeração errada: %', n; END IF;
 SELECT max(numero) INTO n FROM public.creator_ideias WHERE pasta_id = v_pasta2;
 IF n <> 1 THEN RAISE EXCEPTION 'numeração não é por mentorado'; END IF;
 BEGIN
   INSERT INTO public.creator_ideias(pasta_id, link, headline_pt) VALUES (v_pasta, 'https://x/3', 'forjada');
   RAISE EXCEPTION 'app gravou headline direto';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO public.creator_modo(pasta_id) VALUES (v_pasta);
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000078',true);
 IF EXISTS (SELECT 1 FROM public.creator_ideias) THEN RAISE EXCEPTION 'outra conta vê ideias alheias'; END IF;
 IF EXISTS (SELECT 1 FROM public.creator_modo) THEN RAISE EXCEPTION 'outra conta vê o modo alheio'; END IF;
END $$;
-- Atalho: com o modo ligado, o link chega carimbado com o mentorado.
CREATE TEMP TABLE t_tok ON COMMIT DROP AS SELECT 1 AS x;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000079',true);
CREATE TEMP TABLE t_token2 ON COMMIT DROP AS SELECT public.gerar_token_atalho() AS token;
RESET ROLE;
DO $$
DECLARE v_token text;
BEGIN
 SELECT token INTO v_token FROM t_token2;
 IF public.receber_link_atalho(v_token, 'https://www.instagram.com/reel/Z/') <> 'Enviado pro Jarvis (separar ideias)' THEN
   RAISE EXCEPTION 'atalho não reconheceu o modo ligado';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.creator_links l JOIN public.creator_modo m ON m.user_id = l.user_id AND m.pasta_id = l.pasta_id
                WHERE l.link = 'https://www.instagram.com/reel/Z/') THEN
   RAISE EXCEPTION 'link não veio carimbado com o mentorado';
 END IF;
END $$;
ROLLBACK;
