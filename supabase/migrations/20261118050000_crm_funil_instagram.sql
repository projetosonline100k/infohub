-- CRM: situação de cada pessoa no funil do Instagram (18/11/2026, Davi: "quem comentou, quem clicou no botão, quem avançou e não comprou;
-- e uma categoria 'novo seguidor'… minha ideia é abordar as pessoas e vender para elas").
-- Marcas por pessoa (quando recebeu a DM, respondeu, clicou no botão/link, concluiu o fluxo) preenchidas sozinhas pelo Many Hub;
-- recebeu DM leva a Abordado e responder/clicar leva a Respondeu. "Novo seguidor" é uma etapa nova antes de Novo, preenchida à mão
-- (a Meta não entrega a lista de seguidores).
ALTER TABLE public.crm_pessoas
  ADD COLUMN recebeu_dm_em timestamptz, ADD COLUMN respondeu_em timestamptz, ADD COLUMN clicou_botao_em timestamptz,
  ADD COLUMN clicou_link_em timestamptz, ADD COLUMN fluxo_concluido_em timestamptz;

CREATE OR REPLACE FUNCTION public.crm_criar_etapas_padrao(p_cliente uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  INSERT INTO crm_etapas (cliente_id, user_id, nome, chave, ordem)
  SELECT c.id, c.user_id, e.nome, e.chave, e.ordem
    FROM clientes c,
         (VALUES ('Novo seguidor', 'seguidor', 0), ('Novo', 'novo', 1), ('Abordado', 'abordado', 2), ('Respondeu', 'respondeu', 3),
                 ('Proposta', 'proposta', 4), ('Vendido', 'vendido', 5), ('Pós-venda', 'pos_venda', 6)) AS e(nome, chave, ordem)
   WHERE c.id = p_cliente
  ON CONFLICT (cliente_id, chave) WHERE chave IS NOT NULL DO NOTHING;
$function$;
SELECT public.crm_criar_etapas_padrao(id) FROM public.clientes;

-- Marca um passo do funil numa pessoa do Instagram (acha pelo @; cria se ainda não existe) e avança a etapa.
CREATE OR REPLACE FUNCTION public.crm_marcar_ig(p_ig_user_id text, p_contato_id text, p_username text, p_campo text, p_quando timestamptz, p_texto text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  cid uuid; usr text; pid uuid; primeira boolean;
  etapa text := CASE p_campo WHEN 'recebeu_dm' THEN 'abordado' ELSE 'respondeu' END;
BEGIN
  SELECT cliente_id INTO cid FROM instagram_conexoes WHERE ig_user_id = p_ig_user_id AND cliente_id IS NOT NULL LIMIT 1;
  IF cid IS NULL THEN RETURN; END IF;
  usr := nullif(lower(btrim(coalesce(p_username, (SELECT username FROM instagram_contatos WHERE ig_user_id = p_ig_user_id AND contato_id = p_contato_id), ''))), '');
  IF usr IS NULL THEN RETURN; END IF;
  pid := crm_registrar(cid, NULL, NULL, NULL, usr, 'instagram', etapa, NULL, NULL, NULL, p_quando);
  IF pid IS NULL THEN RETURN; END IF;
  SELECT CASE p_campo WHEN 'recebeu_dm' THEN recebeu_dm_em IS NULL WHEN 'respondeu' THEN respondeu_em IS NULL
                      WHEN 'clicou_botao' THEN clicou_botao_em IS NULL WHEN 'clicou_link' THEN clicou_link_em IS NULL ELSE fluxo_concluido_em IS NULL END
    INTO primeira FROM crm_pessoas WHERE id = pid;
  UPDATE crm_pessoas SET
    recebeu_dm_em = CASE WHEN p_campo = 'recebeu_dm' THEN coalesce(recebeu_dm_em, p_quando) ELSE recebeu_dm_em END,
    respondeu_em = CASE WHEN p_campo IN ('respondeu', 'clicou_botao') THEN coalesce(respondeu_em, p_quando) ELSE respondeu_em END,
    clicou_botao_em = CASE WHEN p_campo = 'clicou_botao' THEN coalesce(clicou_botao_em, p_quando) ELSE clicou_botao_em END,
    clicou_link_em = CASE WHEN p_campo = 'clicou_link' THEN coalesce(clicou_link_em, p_quando) ELSE clicou_link_em END,
    fluxo_concluido_em = CASE WHEN p_campo = 'fluxo_concluido' THEN coalesce(fluxo_concluido_em, p_quando) ELSE fluxo_concluido_em END
  WHERE id = pid;
  IF primeira AND p_campo <> 'recebeu_dm' THEN
    INSERT INTO crm_eventos (pessoa_id, cliente_id, user_id, tipo, texto, em)
    SELECT pid, cid, user_id, 'funil', CASE p_campo WHEN 'respondeu' THEN 'Respondeu' WHEN 'clicou_botao' THEN 'Clicou no botão' || coalesce(': ' || left(p_texto, 120), '')
             WHEN 'clicou_link' THEN 'Clicou no link' ELSE 'Concluiu o fluxo' END, p_quando
      FROM crm_pessoas WHERE id = pid;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.crm_marcar_ig(text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_da_mensagem_ig() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.de_mim THEN
    IF NEW.origem IN ('fluxo', 'automacao') THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.contato_id, NULL, 'recebeu_dm', NEW.enviada_em); END IF;
  ELSIF NEW.tipo = 'botao' THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.contato_id, NULL, 'clicou_botao', NEW.enviada_em, NEW.texto);
  ELSIF NEW.tipo IN ('texto', 'midia') THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.contato_id, NULL, 'respondeu', NEW.enviada_em);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
CREATE TRIGGER crm_da_mensagem_ig AFTER INSERT ON public.instagram_mensagens FOR EACH ROW EXECUTE FUNCTION public.crm_da_mensagem_ig();

CREATE OR REPLACE FUNCTION public.crm_do_disparo_ig() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.ig_user_id IS NULL OR NEW.autor_username IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR (OLD.dm_status IS DISTINCT FROM NEW.dm_status) THEN
    IF NEW.dm_status = 'enviada' THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.autor_id, NEW.autor_username, 'recebeu_dm', NEW.criado_em); END IF;
  END IF;
  IF NEW.clicou_em IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.clicou_em IS NULL) THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.autor_id, NEW.autor_username, 'clicou_link', NEW.clicou_em); END IF;
  IF NEW.respondeu_em IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.respondeu_em IS NULL) THEN PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.autor_id, NEW.autor_username, 'respondeu', NEW.respondeu_em); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
CREATE TRIGGER crm_do_disparo_ig AFTER INSERT OR UPDATE OF dm_status, clicou_em, respondeu_em ON public.instagram_automacao_disparos FOR EACH ROW EXECUTE FUNCTION public.crm_do_disparo_ig();

CREATE OR REPLACE FUNCTION public.crm_do_fluxo_ig() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.estado = 'fim' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'fim') THEN
    PERFORM crm_marcar_ig(NEW.ig_user_id, NEW.contato_id, NEW.contato_username, 'fluxo_concluido', now());
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
CREATE TRIGGER crm_do_fluxo_ig AFTER INSERT OR UPDATE OF estado ON public.instagram_fluxo_execucoes FOR EACH ROW EXECUTE FUNCTION public.crm_do_fluxo_ig();

-- Traz o histórico (uma vez), do mais antigo para o mais novo.
SELECT public.crm_marcar_ig(d.ig_user_id, d.autor_id, d.autor_username, 'recebeu_dm', d.criado_em)
  FROM public.instagram_automacao_disparos d WHERE d.dm_status = 'enviada' AND d.autor_username IS NOT NULL AND d.ig_user_id IS NOT NULL ORDER BY d.criado_em;
SELECT public.crm_marcar_ig(d.ig_user_id, d.autor_id, d.autor_username, 'clicou_link', d.clicou_em)
  FROM public.instagram_automacao_disparos d WHERE d.clicou_em IS NOT NULL AND d.autor_username IS NOT NULL AND d.ig_user_id IS NOT NULL ORDER BY d.clicou_em;
SELECT public.crm_marcar_ig(d.ig_user_id, d.autor_id, d.autor_username, 'respondeu', d.respondeu_em)
  FROM public.instagram_automacao_disparos d WHERE d.respondeu_em IS NOT NULL AND d.autor_username IS NOT NULL AND d.ig_user_id IS NOT NULL ORDER BY d.respondeu_em;
SELECT public.crm_marcar_ig(m.ig_user_id, m.contato_id, NULL, CASE WHEN m.de_mim THEN 'recebeu_dm' WHEN m.tipo = 'botao' THEN 'clicou_botao' ELSE 'respondeu' END, m.enviada_em, m.texto)
  FROM public.instagram_mensagens m WHERE (m.de_mim AND m.origem IN ('fluxo', 'automacao')) OR (NOT m.de_mim AND m.tipo IN ('texto', 'midia', 'botao')) ORDER BY m.enviada_em;
SELECT public.crm_marcar_ig(e.ig_user_id, e.contato_id, e.contato_username, 'fluxo_concluido', e.criado_em)
  FROM public.instagram_fluxo_execucoes e WHERE e.estado = 'fim' ORDER BY e.criado_em;

NOTIFY pgrst, 'reload schema';
