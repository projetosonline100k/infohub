-- Regressão: posts do Instagram ganham o projeto da conexão, ligam ao carrossel
-- ou ao card do cronograma (que vira 'postado'); o dono lê, o app não grava.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000241','posts-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000242','posts-alheio-test@example.com',now());
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000243', 'Posts teste', 30, 'x', '10000000-0000-0000-0000-000000000241');
INSERT INTO public.instagram_conexoes(user_id, cliente_id, ig_user_id, username, access_token) VALUES
 ('10000000-0000-0000-0000-000000000241', '10000000-0000-0000-0000-000000000243', 'ig-posts-projeto', 'projeto', 'x');
INSERT INTO public.videos_vertical(id, cliente_id, titulo, status, ordem, user_id, created_at) VALUES
 ('10000000-0000-0000-0000-000000000244', '10000000-0000-0000-0000-000000000243',
  'Domine essas 3 habilidades antes dos 30', 'pronto', 0, '10000000-0000-0000-0000-000000000241', '2026-10-01'),
 ('10000000-0000-0000-0000-000000000245', '10000000-0000-0000-0000-000000000243',
  'Outro vídeo qualquer', 'gravacao', 1, '10000000-0000-0000-0000-000000000241', '2026-10-01');

-- A edge function (service_role) grava; os triggers completam dono, projeto e card.
INSERT INTO public.instagram_posts(ig_media_id, ig_user_id, tipo, legenda, publicado_em, visualizacoes) VALUES
 ('post-reel', 'ig-posts-projeto', 'REELS', E'Domine essas 3 HABILIDADES antes dos 30!\n\nSalva esse vídeo.', '2026-10-10 23:30:00+00', 1000),
 ('post-feed', 'ig-posts-projeto', 'FEED', 'Domine essas 3 habilidades antes dos 30', '2026-10-11 12:00:00+00', 10),
 ('post-curto', 'ig-posts-projeto', 'REELS', 'Outro', '2026-10-11 12:00:00+00', 5);
DO $$
DECLARE r record;
BEGIN
 SELECT user_id, cliente_id, video_vertical_id INTO r FROM public.instagram_posts WHERE ig_media_id = 'post-reel';
 IF r.user_id <> '10000000-0000-0000-0000-000000000241' OR r.cliente_id <> '10000000-0000-0000-0000-000000000243' THEN
   RAISE EXCEPTION 'projeto errado: %', r; END IF;
 IF r.video_vertical_id IS DISTINCT FROM '10000000-0000-0000-0000-000000000244' THEN
   RAISE EXCEPTION 'reel não ligou ao card pela legenda: %', r; END IF;
 -- Post de feed e legenda curta demais não ligam a card.
 IF EXISTS (SELECT 1 FROM public.instagram_posts WHERE ig_media_id IN ('post-feed', 'post-curto') AND video_vertical_id IS NOT NULL) THEN
   RAISE EXCEPTION 'ligou post errado'; END IF;
 -- O card virou 'postado' no dia de Brasília (23:30 UTC de 10/10 = 20:30 de 10/10).
 SELECT status, data_postagem INTO r FROM public.videos_vertical WHERE id = '10000000-0000-0000-0000-000000000244';
 IF r.status <> 'postado' OR r.data_postagem <> '2026-10-10' THEN RAISE EXCEPTION 'card não virou postado: %', r; END IF;
 SELECT status INTO r FROM public.videos_vertical WHERE id = '10000000-0000-0000-0000-000000000245';
 IF r.status <> 'gravacao' THEN RAISE EXCEPTION 'mexeu no card errado: %', r; END IF;
END $$;

-- A atualização diária (upsert) mantém a ligação e só troca os números.
INSERT INTO public.instagram_posts(ig_media_id, ig_user_id, tipo, legenda, publicado_em, visualizacoes)
 VALUES ('post-reel', 'ig-posts-projeto', 'REELS', 'Domine essas 3 habilidades antes dos 30', '2026-10-10 23:30:00+00', 2000)
 ON CONFLICT (ig_media_id) DO UPDATE SET visualizacoes = excluded.visualizacoes;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.instagram_posts WHERE ig_media_id = 'post-reel'
                AND visualizacoes = 2000 AND video_vertical_id = '10000000-0000-0000-0000-000000000244') THEN
   RAISE EXCEPTION 'upsert perdeu a ligação ou o número'; END IF;
END $$;

-- Legenda parecida com o título liga; tema vizinho (outro vídeo) não.
INSERT INTO public.videos_vertical(id, cliente_id, titulo, status, ordem, user_id, created_at) VALUES
 ('10000000-0000-0000-0000-000000000246', '10000000-0000-0000-0000-000000000243',
  'Habilidades que você poderia ter aprendido em 1 mês baseado no seu tempo de tela', 'pronto', 2, '10000000-0000-0000-0000-000000000241', '2026-10-01'),
 ('10000000-0000-0000-0000-000000000247', '10000000-0000-0000-0000-000000000243',
  '4 tipos de amigos que você não deveria perder.', 'pronto', 3, '10000000-0000-0000-0000-000000000241', '2026-10-01');
INSERT INTO public.instagram_posts(ig_media_id, ig_user_id, tipo, legenda, publicado_em) VALUES
 ('post-parecido', 'ig-posts-projeto', 'REELS', E'Habilidades que você poderia ter aprendido em um mês baseado no seu tempo de tela.\n\nSalva.', '2026-10-12 12:00:00+00'),
 ('post-vizinho', 'ig-posts-projeto', 'REELS', '4 tipos de amigos que você pode se permitir perder', '2026-10-12 12:00:00+00');
DO $$
BEGIN
 IF (SELECT video_vertical_id FROM public.instagram_posts WHERE ig_media_id = 'post-parecido')
    IS DISTINCT FROM '10000000-0000-0000-0000-000000000246' THEN RAISE EXCEPTION 'legenda parecida não ligou'; END IF;
 IF (SELECT video_vertical_id FROM public.instagram_posts WHERE ig_media_id = 'post-vizinho') IS NOT NULL THEN
   RAISE EXCEPTION 'tema vizinho ligou ao card errado'; END IF;
END $$;

-- Carrossel publicado pela Dalila liga pelo ig_media_id.
DO $$
DECLARE v_carrossel uuid; v_ligado uuid;
BEGIN
 SELECT id INTO v_carrossel FROM public.carrosseis WHERE ig_media_id IS NOT NULL LIMIT 1;
 IF v_carrossel IS NULL THEN RETURN; END IF;
 INSERT INTO public.instagram_posts(ig_media_id, ig_user_id, tipo, publicado_em)
   SELECT ig_media_id, 'ig-posts-projeto', 'FEED', now() FROM public.carrosseis WHERE id = v_carrossel
   ON CONFLICT (ig_media_id) DO UPDATE SET atualizado_em = now()
   RETURNING carrossel_id INTO v_ligado;
 IF v_ligado IS DISTINCT FROM v_carrossel THEN RAISE EXCEPTION 'carrossel não ligou: %', v_ligado; END IF;
END $$;

-- O dono lê; não grava pelo app.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000241',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.instagram_posts WHERE ig_media_id LIKE 'post-%') <> 5 THEN
   RAISE EXCEPTION 'dono não vê os posts'; END IF;
 BEGIN
   INSERT INTO public.instagram_posts(ig_media_id, ig_user_id, publicado_em) VALUES ('post-app', 'ig-posts-projeto', now());
   RAISE EXCEPTION 'app conseguiu gravar';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

-- Quem não é dono nem da equipe não vê nada.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000242',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.instagram_posts WHERE ig_media_id LIKE 'post-%') THEN
   RAISE EXCEPTION 'estranho vê posts'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
