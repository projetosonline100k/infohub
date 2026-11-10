-- O link do chatbot mostra o que o editor está salvando (10/11/2026, Davi: "ao clicar em ver o link, já tem que ser o
-- que o usuário vai ver"): o rascunho também abre pelo link (sem gravar lead); só o publicado grava.
CREATE OR REPLACE FUNCTION public.chatbot_publico(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nome', nome, 'config', config, 'status', status)
    FROM chatbots WHERE slug = p_slug AND status IN ('publicado', 'rascunho');
$$;
NOTIFY pgrst, 'reload schema';
