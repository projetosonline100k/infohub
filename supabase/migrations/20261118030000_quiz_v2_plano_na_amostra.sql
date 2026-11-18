-- Quiz Instalivros V2 (18/11/2026, Davi, pelo Roy): "livros que combinam" e a amostra viram UMA tela só (o app com o plano deslizando dia a dia).
-- A tela "livros_plano" sai do rascunho (estrutura) e a configuração do plano (livros_temas, perfil_temas, total_dias, areas_pergunta…) passa para a tela "amostra_livro".
-- Não mexe em estrutura_publicada (o Roy publica depois do deploy).
UPDATE public.quizzes q
   SET estrutura = jsonb_set(q.estrutura, '{telas}', (
     SELECT coalesce(jsonb_agg(
              CASE WHEN t->>'tipo' = 'amostra'
                   THEN jsonb_set(jsonb_set(t, '{plano}', coalesce(
                          (SELECT p->'plano' FROM jsonb_array_elements(q.estrutura->'telas') p WHERE p->>'id' = 'livros_plano'), '{}'::jsonb), true),
                          '{amostra}', (t->'amostra') - 'plano_de', true)
                        || jsonb_build_object('titulo', '{nome}, esses são os livros que mais combinam com você')
                   ELSE t END
              ORDER BY n), '[]'::jsonb)
       FROM jsonb_array_elements(q.estrutura->'telas') WITH ORDINALITY AS a(t, n)
      WHERE t->>'id' <> 'livros_plano'))
 WHERE q.id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.estrutura->'telas') p WHERE p->>'id' = 'livros_plano')
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.estrutura->'telas') p WHERE p->>'tipo' = 'amostra');
