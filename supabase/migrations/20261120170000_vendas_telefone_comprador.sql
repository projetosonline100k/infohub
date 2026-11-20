-- Venda ligada ao lead também pelo TELEFONE (20/11/2026, Davi: "acabei de fazer uma venda no Eduzz, mas não apareceu no quiz").
-- O lead deixou só o WhatsApp no quiz (sem e-mail) e a venda só era ligada ao lead pelo e-mail. Agora a venda guarda o telefone do
-- comprador e as regras que acham "o lead dessa venda" aceitam e-mail OU telefone (os últimos 8 dígitos: ignora +55, DDD e o nono dígito).
ALTER TABLE public.vendas_plataforma_eventos ADD COLUMN IF NOT EXISTS comprador_telefone text;

-- Chave de comparação do telefone: os últimos 8 dígitos (null se tiver menos de 8).
CREATE OR REPLACE FUNCTION public.fone_chave(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 8 THEN right(regexp_replace(t, '\D', '', 'g'), 8) END
$$;

-- Vendas antigas: o telefone do comprador já estava no que a plataforma mandou (Eduzz: buyer.cellphone/phone; Kiwify: Customer.mobile;
-- Hotmart: buyer.checkout_phone; postback antigo da Eduzz: cus_cel/cus_tel).
UPDATE public.vendas_plataforma_eventos SET comprador_telefone = nullif(trim(coalesce(
    payload #>> '{data,buyer,cellphone}', payload #>> '{data,buyer,phone}', payload #>> '{buyer,cellphone}', payload #>> '{buyer,phone}',
    payload #>> '{data,customer,cellphone}', payload #>> '{data,customer,phone}',
    payload #>> '{order,Customer,mobile}', payload #>> '{Customer,mobile}', payload #>> '{data,buyer,checkout_phone}',
    payload ->> 'cus_cel', payload ->> 'cus_tel')), '')
 WHERE comprador_telefone IS NULL AND payload IS NOT NULL;

-- CRM: a pessoa da venda também é achada pelo telefone.
CREATE OR REPLACE FUNCTION public.crm_da_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cid uuid; pid uuid;
BEGIN
  IF NEW.tipo NOT IN ('venda', 'reembolso') THEN RETURN NEW; END IF;
  SELECT cliente_id INTO cid FROM produtos_cliente WHERE id = NEW.produto_id;
  IF cid IS NULL THEN RETURN NEW; END IF;
  pid := crm_registrar(cid, NEW.comprador_nome, NEW.comprador_telefone, NEW.comprador_email, NULL, 'venda',
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

-- Embaixadores: sem a marca no checkout, vale o último lead com o e-mail OU o telefone do comprador.
CREATE OR REPLACE FUNCTION public.embaixador_vendas_base(emb embaixadores)
 RETURNS TABLE(transacao_id text, tipo text, valor numeric, data date, comprador_nome text, comprador_email text, produto text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.transacao_id, v.tipo, coalesce(v.valor, 0), v.data, v.comprador_nome, v.comprador_email, p.nome_produto
  FROM public.vendas_plataforma_eventos v JOIN public.produtos_cliente p ON p.id = v.produto_id
  WHERE p.cliente_id = emb.cliente_id AND v.tipo IN ('venda', 'reembolso')
    AND ( lower(coalesce(v.utm_content, '')) = 'aff_' || emb.codigo
       OR ( coalesce(v.utm_content, '') !~* '^aff_' AND (coalesce(v.comprador_email, '') <> '' OR public.fone_chave(v.comprador_telefone) IS NOT NULL)
            AND ( SELECT lower(r.utm->>'utm_content') FROM public.quiz_respostas r
                  WHERE r.cliente_id = emb.cliente_id
                    AND ( lower(r.email) = lower(v.comprador_email) OR public.fone_chave(r.whatsapp) = public.fone_chave(v.comprador_telefone) )
                    AND r.criada_em <= v.data::timestamp + interval '1 day' + interval '3 hours'
                  ORDER BY r.criada_em DESC LIMIT 1 ) = 'aff_' || emb.codigo ) )
$function$;


-- Som de venda no app (20/11, Davi: "como fez essa venda, preciso que saia um som no sistema também"): a venda nova chega ao app na hora
-- pelo realtime (cada um só recebe as vendas dos próprios produtos: a policy dono_le vale também aqui).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vendas_plataforma_eventos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vendas_plataforma_eventos;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
