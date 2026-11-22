-- (20/11/2026) O administrador vê o Many Hub do embaixador (somente leitura): contas conectadas, automações, fluxos e disparos.
CREATE FUNCTION public.embaixador_manyhub_admin(p_embaixador uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE emb public.embaixadores; uid uuid;
BEGIN
  SELECT * INTO emb FROM public.embaixadores WHERE id = p_embaixador;
  IF NOT FOUND OR NOT public.team_allowed(emb.cliente_id, 'conteudo', 'acessar') THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  uid := emb.auth_user_id;
  IF uid IS NULL THEN RETURN jsonb_build_object('conta_criada', false, 'contas', '[]'::jsonb, 'automacoes', '[]'::jsonb, 'fluxos', '[]'::jsonb, 'disparos', '[]'::jsonb); END IF;
  RETURN jsonb_build_object(
    'conta_criada', true,
    'contas', COALESCE((SELECT jsonb_agg(jsonb_build_object('ig_user_id', c.ig_user_id, 'username', c.username, 'token_expira_em', c.token_expira_em)) FROM public.instagram_conexoes c WHERE c.user_id = uid), '[]'::jsonb),
    'automacoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'ativo', a.ativo, 'palavras_chave', a.palavras_chave, 'gatilhos', a.gatilhos, 'disparos', a.disparos, 'criado_em', a.criado_em) ORDER BY a.criado_em DESC) FROM public.instagram_automacoes a WHERE a.user_id = uid), '[]'::jsonb),
    'fluxos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'ativo', f.ativo, 'palavras_chave', f.palavras_chave, 'disparos', f.disparos) ORDER BY f.criado_em DESC) FROM public.instagram_fluxos f WHERE f.user_id = uid), '[]'::jsonb),
    'disparos', COALESCE((SELECT jsonb_agg(x ORDER BY x.criado_em DESC) FROM (SELECT d.autor_username, d.texto, d.dm_status, d.criado_em FROM public.instagram_automacao_disparos d WHERE d.user_id = uid ORDER BY d.criado_em DESC LIMIT 30) x), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.embaixador_manyhub_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embaixador_manyhub_admin(uuid) TO authenticated;
