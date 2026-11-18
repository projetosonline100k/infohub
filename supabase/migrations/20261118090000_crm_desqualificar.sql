-- CRM: desqualificar (18/11/2026, Davi: "conseguir desqualificar algum chat"). A pessoa sai do quadro mas continua no banco com o motivo,
-- então a importação e a leitura diária de seguidores não a trazem de volta; dá para requalificar. Comprar a requalifica sozinha.
ALTER TABLE public.crm_pessoas ADD COLUMN desqualificada_em timestamptz, ADD COLUMN motivo_desqualificacao text CHECK (motivo_desqualificacao IS NULL OR length(motivo_desqualificacao) <= 500);
GRANT UPDATE (desqualificada_em, motivo_desqualificacao) ON public.crm_pessoas TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_da_venda() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cid uuid; pid uuid;
BEGIN
  IF NEW.tipo NOT IN ('venda', 'reembolso') THEN RETURN NEW; END IF;
  SELECT cliente_id INTO cid FROM produtos_cliente WHERE id = NEW.produto_id;
  IF cid IS NULL THEN RETURN NEW; END IF;
  pid := crm_registrar(cid, NEW.comprador_nome, NULL, NEW.comprador_email, NULL, 'venda',
                       CASE WHEN NEW.tipo = 'venda' THEN 'vendido' ELSE NULL END,
                       CASE WHEN NEW.tipo = 'venda' THEN 'compra' ELSE 'reembolso' END,
                       coalesce(NEW.produto_plataforma, 'Produto') || ' (' || NEW.plataforma || ')', NEW.valor, NEW.recebido_em);
  IF pid IS NOT NULL THEN
    UPDATE crm_pessoas SET valor_vendido = greatest(0, valor_vendido + CASE WHEN NEW.tipo = 'venda' THEN NEW.valor ELSE -NEW.valor END),
           desqualificada_em = CASE WHEN NEW.tipo = 'venda' THEN NULL ELSE desqualificada_em END WHERE id = pid;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
NOTIFY pgrst, 'reload schema';
