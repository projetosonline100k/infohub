-- Regressão: a prévia do link usa o que foi escolhido; sem escolha cai no título/imagem da abertura; rascunho de quiz não publicado não vaza.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000341','qpl@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000341',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000343', 'QPL', 30, 'x', '10000000-0000-0000-0000-000000000341');
INSERT INTO public.quizzes(id, cliente_id, titulo, slug, status, estrutura) VALUES
 ('10000000-0000-0000-0000-000000000344', '10000000-0000-0000-0000-000000000343', 'Interno', 'qpl-teste-1', 'publicado', '{"intro":{"titulo":"Da abertura","subtitulo":"Sub","imagem":"https://x.co/a.jpg"},"perguntas":[{"id":"q1","texto":"a","opcoes":[]}],"perfis":[]}'),
 ('10000000-0000-0000-0000-000000000345', '10000000-0000-0000-0000-000000000343', 'Pausado', 'qpl-teste-2', 'pausado', '{"perguntas":[],"perfis":[]}');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.quiz_previa('qpl-teste-1');
  IF r->>'titulo' <> 'Da abertura' OR r->>'imagem' <> 'https://x.co/a.jpg' OR r->>'descricao' <> 'Sub' THEN RAISE EXCEPTION 'não caiu na abertura: %', r; END IF;
  UPDATE public.quizzes SET compartilhar = '{"titulo":"Meu título","imagem":"https://x.co/b.png"}' WHERE id = '10000000-0000-0000-0000-000000000344';
  r := public.quiz_previa('qpl-teste-1');
  IF r->>'titulo' <> 'Meu título' OR r->>'imagem' <> 'https://x.co/b.png' OR r->>'descricao' <> 'Sub' THEN RAISE EXCEPTION 'não usou o escolhido: %', r; END IF;
  IF public.quiz_previa('qpl-teste-2') IS NOT NULL THEN RAISE EXCEPTION 'quiz pausado vazou'; END IF;
END $$;
ROLLBACK;
