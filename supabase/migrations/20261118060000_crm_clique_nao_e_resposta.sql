-- Corrige 20261118050000: clicar no link da DM só marca a pessoa ("clicou no link"), não é responder; só resposta ou toque num botão leva a Respondeu.
CREATE OR REPLACE FUNCTION public.crm_marcar_ig(p_ig_user_id text, p_contato_id text, p_username text, p_campo text, p_quando timestamptz, p_texto text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  cid uuid; usr text; pid uuid; primeira boolean;
  etapa text := CASE WHEN p_campo IN ('respondeu', 'clicou_botao') THEN 'respondeu' ELSE 'abordado' END;
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

-- Quem foi para Respondeu só por clicar no link (nada de resposta nem botão) volta para Abordado; ninguém mexeu à mão ainda.
UPDATE public.crm_pessoas p SET etapa_id = (SELECT e2.id FROM public.crm_etapas e2 WHERE e2.cliente_id = p.cliente_id AND e2.chave = 'abordado')
  FROM public.crm_etapas e WHERE e.id = p.etapa_id AND e.chave = 'respondeu' AND p.origem = 'instagram'
   AND p.respondeu_em IS NULL AND p.clicou_botao_em IS NULL;
DELETE FROM public.crm_eventos ev USING public.crm_pessoas p
 WHERE ev.pessoa_id = p.id AND ev.tipo = 'etapa' AND ev.texto = 'Foi para Respondeu' AND p.respondeu_em IS NULL AND p.clicou_botao_em IS NULL;
NOTIFY pgrst, 'reload schema';
