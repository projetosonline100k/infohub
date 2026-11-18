-- Quiz Instalivros V2 (18/11/2026, Davi, pelo Roy): tela "amostra" ("Seu primeiro livro chegou") depois de "livros_plano" e antes da oferta.
-- 1) o evento novo "amostra" guarda o que a pessoa ouviu (detalhe: "ouviu=42s;total=75s;fim=nao" ou "abriu"; vale o último);
-- 2) a V2 ganha a tela, com `amostras` vazio: enquanto o Roy não cadastrar um trecho, a tela é pulada.
ALTER TABLE public.quiz_eventos DROP CONSTRAINT quiz_eventos_tipo_check;
ALTER TABLE public.quiz_eventos ADD CONSTRAINT quiz_eventos_tipo_check CHECK (tipo IN ('visita', 'passo', 'fim', 'cta', 'amostra'));
CREATE OR REPLACE FUNCTION public.registrar_evento_quiz(p_slug text, p_sessao uuid, p_tipo text, p_passo integer DEFAULT -1, p_utm jsonb DEFAULT NULL, p_detalhe text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record;
BEGIN
  IF p_tipo NOT IN ('visita', 'passo', 'fim', 'cta', 'amostra') OR p_sessao IS NULL THEN RETURN; END IF;
  SELECT id, cliente_id INTO q FROM quizzes WHERE (slug = p_slug OR p_slug = ANY (slugs_antigos)) AND status = 'publicado';
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO quiz_eventos (quiz_id, cliente_id, sessao, tipo, passo, utm, detalhe)
  VALUES (q.id, q.cliente_id, p_sessao, p_tipo, CASE WHEN p_tipo = 'passo' THEN least(greatest(coalesce(p_passo, 0), 0), 300) ELSE -1 END, quiz_utm_limpa(p_utm),
          CASE WHEN p_tipo IN ('cta', 'amostra') THEN left(nullif(btrim(p_detalhe), ''), 80) END)
  ON CONFLICT (quiz_id, sessao, tipo, passo) DO UPDATE SET detalhe = EXCLUDED.detalhe WHERE quiz_eventos.tipo IN ('cta', 'amostra') AND EXCLUDED.detalhe IS NOT NULL;
END;
$$;

UPDATE public.quizzes q
   SET estrutura = jsonb_set(q.estrutura, '{telas}', (
     SELECT jsonb_agg(x.t ORDER BY x.n)
       FROM (
         SELECT t, n::numeric AS n FROM jsonb_array_elements(q.estrutura->'telas') WITH ORDINALITY AS a(t, n)
         UNION ALL
         SELECT jsonb_build_object('id', 'amostra_livro', 'tipo', 'amostra', 'depois_de', t->>'depois_de',
                  'titulo', 'Seu primeiro livro chegou', 'botao', 'Continuar',
                  'amostra', jsonb_build_object('plano_de', 'livros_plano', 'segundos', 75, 'aviso', 'Toque no livro para abrir',
                    'fim_texto', 'Gostou? O resumo completo está no seu plano', 'texto_bloqueado', 'Continue lendo no app', 'amostras', '{}'::jsonb)),
                n + 0.5
           FROM jsonb_array_elements(q.estrutura->'telas') WITH ORDINALITY AS a(t, n) WHERE t->>'id' = 'livros_plano'
       ) x))
 WHERE q.id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q.estrutura->'telas') t WHERE t->>'id' = 'amostra_livro');
