-- Cancelar um pedido ao funcionário (15/11/2026, Davi: "preciso ter a opção de cancelar um pedido"): a mensagem pendente (enviada/lida) vira 'cancelada'.
-- O ouvinte percebe e para o que estiver rodando (scripts/jarvis-ouvinte.py, passos.rodar); mensagem 'enviada' cancelada nem chega a ser pega.
ALTER TABLE public.briefing_mensagens DROP CONSTRAINT briefing_mensagens_status_check;
ALTER TABLE public.briefing_mensagens ADD CONSTRAINT briefing_mensagens_status_check CHECK (status IN ('enviada', 'lida', 'respondida', 'cancelada'));
-- O app só pode CANCELAR mensagem própria do Davi que ainda não foi respondida; nenhuma outra mudança de status pelo app.
CREATE OR REPLACE FUNCTION public.briefing_mensagem_cancelar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND current_user IN ('authenticated', 'anon') THEN
    IF NOT (NEW.status = 'cancelada' AND OLD.status IN ('enviada', 'lida') AND OLD.papel = 'davi') THEN
      RAISE EXCEPTION 'o app só pode cancelar um pedido pendente' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER briefing_mensagem_cancelar BEFORE UPDATE OF status ON public.briefing_mensagens FOR EACH ROW EXECUTE FUNCTION public.briefing_mensagem_cancelar();
GRANT UPDATE (status) ON public.briefing_mensagens TO authenticated;
NOTIFY pgrst, 'reload schema';
