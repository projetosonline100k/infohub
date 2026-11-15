-- Quiz Instalivros V2 (15/11/2026, Davi, pelo Roy): a pergunta "areas" vira "Monte seu trio de evolução" (estilo orbita: habilidades em volta do mascote). Só a V2 (ad802bd4…); a V1 não muda.
UPDATE public.quizzes
   SET estrutura = jsonb_set(estrutura, '{perguntas}', (
         SELECT jsonb_agg(CASE WHEN p->>'id' = 'areas' THEN jsonb_set(p, '{estilo}', '"orbita"') ELSE p END ORDER BY ord)
           FROM jsonb_array_elements(estrutura->'perguntas') WITH ORDINALITY AS t(p, ord)))
 WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7';
