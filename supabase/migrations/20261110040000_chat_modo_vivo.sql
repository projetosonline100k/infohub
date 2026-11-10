-- Modo vivo do chat com o funcionário (10/11/2026, Davi: "deixar o chat vivo, o Roy, e ele mexer no meu PC, Chrome…").
-- Ligado, a conversa deixa de ser atendida pelo servidor e passa a ser atendida por um Claude rodando no Mac do Davi
-- (scripts/empresa/vivo.py), com sessão aberta, Chrome e comandos. Como isso dá controle do computador, só o Davi
-- liga, e só mensagem escrita por ele (autor_id) é obedecida: quem é da equipe e escreve no mesmo chat não manda no Mac.
ALTER TABLE public.briefings ADD COLUMN modo_vivo boolean NOT NULL DEFAULT false, ADD COLUMN sessao_vivo text;
ALTER TABLE public.briefing_mensagens ADD COLUMN autor_id uuid;

-- Quem escreveu de verdade (o gatilho de equipe carimba o dono no user_id; aqui fica a pessoa).
CREATE OR REPLACE FUNCTION public.briefing_mensagem_autor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.autor_id := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER briefing_mensagem_autor BEFORE INSERT ON public.briefing_mensagens FOR EACH ROW EXECUTE FUNCTION public.briefing_mensagem_autor();

CREATE OR REPLACE FUNCTION public.briefing_modo_vivo_so_davi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.modo_vivo AND (TG_OP = 'INSERT' OR NOT OLD.modo_vivo) AND auth.uid() IS NOT NULL
     AND coalesce((SELECT lower(email) FROM auth.users WHERE id = auth.uid()), '') <> 'eu.daviqueiroz22@gmail.com' THEN
    RAISE EXCEPTION 'só o Davi liga o modo vivo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER briefing_modo_vivo_so_davi BEFORE INSERT OR UPDATE OF modo_vivo ON public.briefings FOR EACH ROW EXECUTE FUNCTION public.briefing_modo_vivo_so_davi();

NOTIFY pgrst, 'reload schema';
