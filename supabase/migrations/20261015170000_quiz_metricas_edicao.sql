-- Quiz depois de publicado (pedido do Davi, 15/10/2026): "conseguir abrir ele
-- para editar algo, aparecer o chat normal" e "ver as métricas".
--
-- 1) O Roy também envia imagem para quiz publicado ou pausado (antes só em
--    criando/revisar), pros ajustes pedidos no chat depois de publicar.
CREATE OR REPLACE FUNCTION public.quiz_envio_permitido(caminho text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE partes text[] := storage.foldername(caminho);
BEGIN
  IF array_length(partes, 1) IS DISTINCT FROM 3 OR partes[1] <> 'roy'
     OR caminho !~ '/[a-z0-9-]{1,60}\.(png|jpg|webp)$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.quiz_envios e JOIN public.quizzes q ON q.id = e.quiz_id
    WHERE e.quiz_id = partes[2]::uuid AND e.token = partes[3]::uuid AND e.expira_em > now()
      AND q.status IN ('criando', 'revisar', 'publicado', 'pausado'));
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

-- 2) Métricas: o link público registra, sem dado pessoal, cada sessão (uma
--    aba aberta): a visita, até que tela chegou, o fim e o clique na oferta.
CREATE TABLE public.quiz_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  sessao uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('visita', 'passo', 'fim', 'cta')),
  passo integer NOT NULL DEFAULT -1 CHECK (passo BETWEEN -1 AND 300),
  criado_em timestamptz NOT NULL DEFAULT now()
);
-- Um registro por sessão/tipo/tela (recarregar a página não conta duas vezes).
CREATE UNIQUE INDEX quiz_eventos_unico ON public.quiz_eventos (quiz_id, sessao, tipo, passo);
CREATE INDEX quiz_eventos_quiz_idx ON public.quiz_eventos (quiz_id, criado_em);

ALTER TABLE public.quiz_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_eventos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.quiz_eventos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.quiz_eventos FOR SELECT TO authenticated
  USING (public.team_row_allowed('quiz_eventos', to_jsonb(quiz_eventos.*), 'conteudo', 'acessar'));
GRANT SELECT ON public.quiz_eventos TO authenticated;   -- evento só entra pelo RPC

CREATE OR REPLACE FUNCTION public.registrar_evento_quiz(p_slug text, p_sessao uuid, p_tipo text, p_passo integer DEFAULT -1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  IF p_tipo NOT IN ('visita', 'passo', 'fim', 'cta') OR p_sessao IS NULL THEN RETURN; END IF;
  SELECT id, cliente_id INTO q FROM quizzes WHERE slug = p_slug AND status = 'publicado';
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO quiz_eventos (quiz_id, cliente_id, sessao, tipo, passo)
  VALUES (q.id, q.cliente_id, p_sessao, p_tipo, CASE WHEN p_tipo = 'passo' THEN least(greatest(coalesce(p_passo, 0), 0), 300) ELSE -1 END)
  ON CONFLICT (quiz_id, sessao, tipo, passo) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_evento_quiz(text, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_evento_quiz(text, uuid, text, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
