-- Conversa em grupo (pedido do Davi, 15/10/2026): "estou conversando com o
-- Ítalo ao mesmo tempo… seria interessante adicionar ele à conversa, assim
-- consigo ver o que cada um está pensando". A conversa (briefing) ganha
-- participantes além do dono; cada resposta registra quem falou.
ALTER TABLE public.briefings ADD COLUMN participantes uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.briefing_mensagens ADD COLUMN membro_id uuid REFERENCES public.membros(id) ON DELETE SET NULL;

-- O app pode chamar alguém pra conversa.
GRANT UPDATE (participantes) ON public.briefings TO authenticated;

-- Participantes são do mesmo projeto, sem repetir o dono.
CREATE OR REPLACE FUNCTION public.briefing_confere_participantes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.participantes := ARRAY(SELECT DISTINCT p FROM unnest(NEW.participantes) p WHERE p <> NEW.membro_id);
  IF EXISTS (SELECT 1 FROM unnest(NEW.participantes) p
              WHERE NOT EXISTS (SELECT 1 FROM membros m WHERE m.id = p AND m.cliente_id = NEW.cliente_id)) THEN
    RAISE EXCEPTION 'participante não é deste projeto';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER briefing_confere_participantes BEFORE INSERT OR UPDATE OF participantes ON public.briefings
  FOR EACH ROW EXECUTE FUNCTION public.briefing_confere_participantes();

NOTIFY pgrst, 'reload schema';
