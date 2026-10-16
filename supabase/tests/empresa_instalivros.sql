-- A empresa do Instalivros tem a mesma equipe do Davi Queiroz (setores e pessoas),
-- tudo apontando para o próprio projeto, e a automação de edição com o Danilo de lá.
BEGIN;
DO $$
DECLARE
  v_de uuid := 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';
  v_para uuid := 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3';
BEGIN
  IF (SELECT count(*) FROM public.setores WHERE cliente_id = v_para) <> (SELECT count(*) FROM public.setores WHERE cliente_id = v_de) THEN
    RAISE EXCEPTION 'setores diferentes'; END IF;
  IF EXISTS (SELECT nome FROM public.membros WHERE cliente_id = v_de EXCEPT SELECT nome FROM public.membros WHERE cliente_id = v_para) THEN
    RAISE EXCEPTION 'faltou alguém da equipe'; END IF;
  IF EXISTS (SELECT nome FROM public.membros WHERE cliente_id = v_para GROUP BY nome HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'equipe duplicada'; END IF;
  IF EXISTS (SELECT 1 FROM public.membros m LEFT JOIN public.setores s ON s.id = m.setor_id
              WHERE m.cliente_id = v_para AND m.setor_id IS NOT NULL AND s.cliente_id <> v_para) THEN
    RAISE EXCEPTION 'membro apontando para setor de outro projeto'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.automacoes_conteudo a JOIN public.membros m ON m.id = a.responsavel_id
                  WHERE a.cliente_id = v_para AND a.etapa = 'edicao' AND m.cliente_id = v_para AND m.nome = 'Danilo') THEN
    RAISE EXCEPTION 'automação de edição do Danilo faltando'; END IF;
END $$;
ROLLBACK;
