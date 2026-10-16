-- Empresa do projeto Instalivros = cópia da empresa do projeto Davi Queiroz.
-- Pedido do Davi (15/10/2026): "implemente a equipe no projeto do Instalivros também".
-- Equipe chega zerada (regra do Davi): só a estrutura; a inteligência geral de cada agente já vale em todo projeto.
-- Copia setores, membros (mesmo nome, função, IA ou pessoa, responsabilidades, conta de login)
-- e as automações de conteúdo (entrou em Edição → tarefa do Danilo). Só roda se o projeto
-- do Instalivros ainda não tiver setores, então rodar de novo não duplica.
DO $$
DECLARE
  v_de uuid := 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';   -- Davi Queiroz
  v_para uuid := 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3'; -- Instalivros
BEGIN
  IF EXISTS (SELECT 1 FROM public.setores WHERE cliente_id = v_para) THEN RETURN; END IF;

  INSERT INTO public.setores (cliente_id, user_id, nome, descricao, cor, icone, ordem)
  SELECT v_para, user_id, nome, descricao, cor, icone, ordem FROM public.setores WHERE cliente_id = v_de;

  INSERT INTO public.membros (cliente_id, setor_id, user_id, nome, funcao, responsabilidades, avatar_url, conta_id, eh_ia, ativo, ordem, link_ia)
  SELECT v_para, sp.id, m.user_id, m.nome, m.funcao, m.responsabilidades, m.avatar_url, m.conta_id, m.eh_ia, m.ativo, m.ordem, m.link_ia
    FROM public.membros m
    LEFT JOIN public.setores sd ON sd.id = m.setor_id
    LEFT JOIN public.setores sp ON sp.cliente_id = v_para AND sp.nome = sd.nome
   WHERE m.cliente_id = v_de;

  INSERT INTO public.automacoes_conteudo (cliente_id, user_id, etapa, responsavel_id, tipo, titulo_modelo, prazo_dias, ativo)
  SELECT v_para, a.user_id, a.etapa, mp.id, a.tipo, a.titulo_modelo, a.prazo_dias, a.ativo
    FROM public.automacoes_conteudo a
    JOIN public.membros md ON md.id = a.responsavel_id
    JOIN public.membros mp ON mp.cliente_id = v_para AND mp.nome = md.nome
   WHERE a.cliente_id = v_de;
END $$;
