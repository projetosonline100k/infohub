-- A empresa do Matheus Souto é igual à do Davi Queiroz e não aponta para nada do projeto do Davi.
BEGIN;
DO $$
DECLARE
  v_de uuid := 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';
  v_para uuid := 'c2373b17-98ef-4c0a-b0ad-6e57fef4ce98';
BEGIN
  IF (SELECT count(*) FROM public.setores WHERE cliente_id = v_para) <> (SELECT count(*) FROM public.setores WHERE cliente_id = v_de) THEN
    RAISE EXCEPTION 'setores diferentes'; END IF;
  IF EXISTS (
    -- Mesmas pessoas (o cargo de cada uma pode mudar em um projeto só, ex.: Gabriel/Roy no do Davi em 15/10).
    SELECT nome FROM public.membros WHERE cliente_id = v_de
    EXCEPT SELECT nome FROM public.membros WHERE cliente_id = v_para) THEN
    RAISE EXCEPTION 'faltou alguém da equipe'; END IF;
  IF (SELECT count(*) FROM public.membros WHERE cliente_id = v_para) <> (SELECT count(*) FROM public.membros WHERE cliente_id = v_de) THEN
    RAISE EXCEPTION 'equipe duplicada'; END IF;
  -- Cada pessoa no setor de mesmo nome, mas do projeto do Matheus.
  IF EXISTS (SELECT 1 FROM public.membros mp JOIN public.membros md ON md.cliente_id = v_de AND md.nome = mp.nome
              LEFT JOIN public.setores sp ON sp.id = mp.setor_id LEFT JOIN public.setores sd ON sd.id = md.setor_id
             WHERE mp.cliente_id = v_para AND (sp.nome IS DISTINCT FROM sd.nome OR (sp.id IS NOT NULL AND sp.cliente_id <> v_para))) THEN
    RAISE EXCEPTION 'setor errado'; END IF;
  IF NOT (SELECT eh_ia FROM public.membros WHERE cliente_id = v_para AND nome = 'Ítalo') THEN RAISE EXCEPTION 'Ítalo não é IA'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.automacoes_conteudo a JOIN public.membros m ON m.id = a.responsavel_id
                  WHERE a.cliente_id = v_para AND a.etapa = 'edicao' AND m.cliente_id = v_para AND m.nome = 'Danilo') THEN
    RAISE EXCEPTION 'automação de edição do Danilo faltando'; END IF;
END $$;
ROLLBACK;
