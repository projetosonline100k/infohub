-- CRM: mensagem que o Davi escreve pelo próprio Instagram (origem 'instagram', o eco que a Meta devolve) ou pelo chat do app ('davi')
-- também conta como abordagem: a pessoa vai para Abordado sozinha (Davi: "eu mesmo escrevo e o CRM já identifica e move").
CREATE OR REPLACE FUNCTION public.crm_da_mensagem_ig() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.de_mim THEN
    IF NEW.origem IN ('fluxo', 'automacao', 'instagram', 'davi') THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.contato_id, NULL, 'recebeu_dm', NEW.enviada_em); END IF;
  ELSIF NEW.tipo = 'botao' THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.contato_id, NULL, 'clicou_botao', NEW.enviada_em, NEW.texto);
  ELSIF NEW.tipo IN ('texto', 'midia') THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.contato_id, NULL, 'respondeu', NEW.enviada_em);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
SELECT public.crm_marcar_ig(m.ig_user_id, m.contato_id, NULL, 'recebeu_dm', m.enviada_em)
  FROM public.instagram_mensagens m WHERE m.de_mim AND m.origem IN ('instagram', 'davi') ORDER BY m.enviada_em;
NOTIFY pgrst, 'reload schema';
