-- Retomar um agente que deu erro ANTES de mandar a primeira mensagem deve voltar a abordar (e não ficar "conversando" mudo, 13/11).
CREATE OR REPLACE FUNCTION public.x1_agente_estado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'conversando' AND OLD.estado IN ('pausado', 'aguardando_humano', 'erro') THEN
    IF OLD.enviadas = 0 THEN NEW.estado := 'abordar'; NEW.motivo := NULL;
    ELSE NEW.cursor_em := now();
    END IF;
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END; $$;
