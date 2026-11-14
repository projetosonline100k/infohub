-- Roy (carrosséis, páginas e quizzes) no projeto Mariah (pedido do Davi, 14/11/2026: "replique o Roy para esse projeto").
-- Chega zerado (só a estrutura, igual ao Roy do Instalivros). Não duplica se o projeto já tiver Roy.
DO $$
DECLARE
  v_de uuid := 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3';   -- Instalivros (Roy de referência)
  v_para uuid := '09d84886-647f-4daf-932f-b9e3878d1907'; -- Mariah
BEGIN
  IF EXISTS (SELECT 1 FROM public.membros WHERE cliente_id = v_para AND nome = 'Roy') THEN RETURN; END IF;
  INSERT INTO public.membros (cliente_id, setor_id, user_id, nome, funcao, responsabilidades, avatar_url, conta_id, eh_ia, ativo, ordem, link_ia, autonomo)
  SELECT v_para,
         (SELECT id FROM public.setores WHERE cliente_id = v_para AND nome = 'Audiovisual' LIMIT 1),
         coalesce(m.user_id, (SELECT user_id FROM public.clientes WHERE id = v_para)),
         m.nome, m.funcao, m.responsabilidades, m.avatar_url, m.conta_id, m.eh_ia, m.ativo,
         coalesce((SELECT max(ordem) FROM public.membros WHERE cliente_id = v_para), 0) + 1, m.link_ia, m.autonomo
    FROM public.membros m WHERE m.cliente_id = v_de AND m.nome = 'Roy';
END $$;
