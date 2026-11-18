-- Projeto Davi Queiroz (18/11/2026, Davi: conta eu.davioficial; fluxo "Novo seguidor → boas-vindas → iniciou conversa → pitch → comprou ou não").
-- Liga a conta do Instagram ao projeto (é o que faz as conversas e os fluxos dela alimentarem o CRM) e dá a esse projeto os nomes do fluxo dele.
UPDATE public.instagram_conexoes SET cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'
 WHERE ig_user_id = '17841439728505829' AND cliente_id IS NULL;
SELECT public.crm_criar_etapas_padrao('e4b24f93-0eda-43fc-b50e-3ebe24f8905f');
UPDATE public.crm_etapas SET nome = CASE chave WHEN 'abordado' THEN 'Boas-vindas' WHEN 'respondeu' THEN 'Iniciou conversa' WHEN 'proposta' THEN 'Pitch'
                                              WHEN 'vendido' THEN 'Comprou' WHEN 'pos_venda' THEN 'Não comprou' ELSE nome END
 WHERE cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND chave IN ('abordado', 'respondeu', 'proposta', 'vendido', 'pos_venda');
-- Traz o histórico dessa conta para o CRM.
SELECT public.crm_registrar('e4b24f93-0eda-43fc-b50e-3ebe24f8905f', c.nome, NULL, NULL, c.username, 'instagram', 'novo', 'instagram', 'Conversou no Instagram', NULL, c.atualizado_em)
  FROM public.instagram_contatos c WHERE c.ig_user_id = '17841439728505829' AND c.username IS NOT NULL;
SELECT public.crm_marcar_ig(m.ig_user_id, m.contato_id, NULL, CASE WHEN m.de_mim THEN 'recebeu_dm' WHEN m.tipo = 'botao' THEN 'clicou_botao' ELSE 'respondeu' END, m.enviada_em, m.texto)
  FROM public.instagram_mensagens m WHERE m.ig_user_id = '17841439728505829'
   AND ((m.de_mim AND m.origem IN ('fluxo', 'automacao', 'instagram', 'davi')) OR (NOT m.de_mim AND m.tipo IN ('texto', 'midia', 'botao'))) ORDER BY m.enviada_em;
SELECT public.crm_marcar_ig(d.ig_user_id, d.autor_id, d.autor_username, 'recebeu_dm', d.criado_em)
  FROM public.instagram_automacao_disparos d WHERE d.ig_user_id = '17841439728505829' AND d.dm_status = 'enviada' AND d.autor_username IS NOT NULL ORDER BY d.criado_em;
SELECT public.crm_marcar_ig(d.ig_user_id, d.autor_id, d.autor_username, 'clicou_link', d.clicou_em)
  FROM public.instagram_automacao_disparos d WHERE d.ig_user_id = '17841439728505829' AND d.clicou_em IS NOT NULL AND d.autor_username IS NOT NULL ORDER BY d.clicou_em;
NOTIFY pgrst, 'reload schema';
