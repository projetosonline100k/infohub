-- "Em qual Instagram a Dalila publica este projeto?" vira UMA função, usada
-- pelo gatilho carrossel_confere_instagram, pela edge dalila-publicar e pela
-- tela de programar (regra do Davi, 15/10/2026: nunca no perfil errado).
-- Vale a conexão do próprio projeto; a conexão geral da conta (sem projeto,
-- o @eu.davioficial) só para o projeto Davi Queiroz.
CREATE FUNCTION public.dalila_conexao_do_projeto(p_cliente uuid)
RETURNS text -- ig_user_id, ou NULL se o projeto não tem Instagram
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT ig_user_id FROM public.instagram_conexoes WHERE cliente_id = p_cliente ORDER BY criado_em LIMIT 1),
    (SELECT ic.ig_user_id FROM public.instagram_conexoes ic JOIN public.clientes c ON c.user_id = ic.user_id
      WHERE p_cliente = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND c.id = p_cliente AND ic.cliente_id IS NULL
      ORDER BY ic.criado_em LIMIT 1));
$$;
REVOKE ALL ON FUNCTION public.dalila_conexao_do_projeto(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dalila_conexao_do_projeto(uuid) TO service_role;

-- Para a tela: o @ que vai receber o post (sem token), ou NULL.
CREATE FUNCTION public.instagram_do_projeto(p_cliente uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ic.username FROM public.instagram_conexoes ic
  WHERE (EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente AND user_id = auth.uid())
         OR public.team_allowed(p_cliente, 'atividades', 'acessar'))
    AND ic.ig_user_id = public.dalila_conexao_do_projeto(p_cliente);
$$;
REVOKE ALL ON FUNCTION public.instagram_do_projeto(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.instagram_do_projeto(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.carrossel_confere_instagram()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('programado', 'publicando') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND public.dalila_conexao_do_projeto(NEW.cliente_id) IS NULL THEN
    RAISE EXCEPTION 'Este projeto não tem Instagram conectado: a Dalila não publica no perfil de outro projeto. Conecte o Instagram dele primeiro.';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
