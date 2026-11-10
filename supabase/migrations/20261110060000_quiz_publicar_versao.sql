-- Publicar do quiz (10/11/2026, Davi: "um botão Publicar no topo; ao clicar, os ajustes vão para o ar no mesmo link").
-- A edição passa a ser rascunho: `estrutura` é a que se edita (e que o Roy salva); `estrutura_publicada` é a que o link
-- mostra para quem abre o quiz publicado. O botão Publicar copia uma para a outra. Quiz ainda em teste (status
-- 'revisar') continua mostrando a `estrutura` no link de teste.
ALTER TABLE public.quizzes ADD COLUMN estrutura_publicada jsonb;
UPDATE public.quizzes SET estrutura_publicada = estrutura WHERE status IN ('publicado', 'pausado');   -- o que já está no ar continua igual

CREATE OR REPLACE FUNCTION public.quiz_versao_publicada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Ao publicar pela primeira vez, a versão publicada é a atual (pausado → publicado de novo mantém a que estava no ar).
  IF NEW.status = 'publicado' AND NEW.estrutura_publicada IS NULL THEN NEW.estrutura_publicada := NEW.estrutura; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER quiz_versao_publicada BEFORE INSERT OR UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.quiz_versao_publicada();

CREATE OR REPLACE FUNCTION public.quiz_publico(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('titulo', titulo,
           'estrutura', CASE WHEN status = 'publicado' THEN coalesce(estrutura_publicada, estrutura) ELSE estrutura END)
    FROM quizzes WHERE slug = p_slug AND status IN ('revisar', 'publicado');
$$;
NOTIFY pgrst, 'reload schema';
