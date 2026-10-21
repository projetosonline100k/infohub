-- Regressão: aprendizado nunca entra na biblioteca geral; a biblioteca do Davi foi marcada.
BEGIN;
DO $$
BEGIN
  BEGIN
    UPDATE public.inteligencia_membros SET compartilhado = true WHERE tipo = 'aprendizado';
    IF FOUND THEN RAISE EXCEPTION 'aprendizado virou biblioteca'; END IF;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT count(*) FROM public.inteligencia_membros WHERE compartilhado) < 1 THEN
    RAISE EXCEPTION 'biblioteca vazia'; END IF;
END $$;
ROLLBACK;
