-- Modo vivo do Lauro na conversa do estilo (12/11/2026, Davi: "o Lauro precisa ter vida mesmo, igual o quiz, que consegue acessar as paradas e ver os negócios").
-- Ligado, os pedidos do perfil vão para um Claude no Mac do Davi, com o Chrome dele (Instagram logado), para abrir e ASSISTIR as referências.
-- Como dá controle do computador, só o Davi liga e só pedido escrito por ele (autor_id) é obedecido (mesmo desenho do chatbot).
ALTER TABLE public.esteira_dark_perfis ADD COLUMN modo_vivo boolean NOT NULL DEFAULT false, ADD COLUMN sessao_vivo text;
CREATE OR REPLACE FUNCTION public.esteira_dark_modo_vivo_so_davi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.modo_vivo AND (TG_OP = 'INSERT' OR NOT OLD.modo_vivo) AND auth.uid() IS NOT NULL
     AND coalesce((SELECT lower(email) FROM auth.users WHERE id = auth.uid()), '') <> 'eu.daviqueiroz22@gmail.com' THEN
    RAISE EXCEPTION 'só o Davi liga o modo vivo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER esteira_dark_modo_vivo_so_davi BEFORE INSERT OR UPDATE OF modo_vivo ON public.esteira_dark_perfis FOR EACH ROW EXECUTE FUNCTION public.esteira_dark_modo_vivo_so_davi();
GRANT UPDATE (modo_vivo) ON public.esteira_dark_perfis TO authenticated;
NOTIFY pgrst, 'reload schema';
