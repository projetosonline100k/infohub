-- Modo vivo do Assistente do chatbot (10/11/2026, Davi: "vamos criar a função do ao vivo para esse modo aqui também").
-- Ligado, os pedidos do Assistente deixam de ir para o Claude do servidor e vão para um Claude no Mac do Davi, com sessão
-- aberta, Chrome e comandos (mesmo desenho do modo vivo do chat dos funcionários). Como dá controle do computador, só o
-- Davi liga e só pedido escrito por ele (autor_id) é obedecido.
ALTER TABLE public.chatbots ADD COLUMN modo_vivo boolean NOT NULL DEFAULT false, ADD COLUMN sessao_vivo text;
ALTER TABLE public.chatbot_pedidos ADD COLUMN autor_id uuid;

CREATE OR REPLACE FUNCTION public.chatbot_pedido_autor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.autor_id := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chatbot_pedido_autor BEFORE INSERT ON public.chatbot_pedidos FOR EACH ROW EXECUTE FUNCTION public.chatbot_pedido_autor();

CREATE OR REPLACE FUNCTION public.chatbot_modo_vivo_so_davi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.modo_vivo AND (TG_OP = 'INSERT' OR NOT OLD.modo_vivo) AND auth.uid() IS NOT NULL
     AND coalesce((SELECT lower(email) FROM auth.users WHERE id = auth.uid()), '') <> 'eu.daviqueiroz22@gmail.com' THEN
    RAISE EXCEPTION 'só o Davi liga o modo vivo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chatbot_modo_vivo_so_davi BEFORE INSERT OR UPDATE OF modo_vivo ON public.chatbots FOR EACH ROW EXECUTE FUNCTION public.chatbot_modo_vivo_so_davi();

NOTIFY pgrst, 'reload schema';
