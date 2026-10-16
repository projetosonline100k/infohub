-- A empresa do Yuri tem a mesma equipe do Davi Queiroz (setores e pessoas),
-- tudo apontando para o próprio projeto, e a automação de edição com o Danilo de lá.
BEGIN;
DO $$
DECLARE
  v_de uuid := 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f';
  v_para uuid := 'f4cf4d62-e34c-412b-9c36-4cbed478186d';
BEGIN
  -- (16/10) Sem exigir cópia exata da equipe do Davi: depois da cópia, o Davi cria e apaga escritórios e pessoas.
  IF EXISTS (SELECT nome FROM public.membros WHERE cliente_id = v_para GROUP BY nome HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'equipe duplicada'; END IF;
  -- O próprio Yuri na Diretoria, ligado ao login dele (desde 15/10).
  IF NOT EXISTS (SELECT 1 FROM public.membros m JOIN public.setores s ON s.id = m.setor_id
                  WHERE m.cliente_id = v_para AND m.nome = 'Yuri' AND s.nome = 'Diretoria' AND NOT m.eh_ia AND m.conta_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Yuri fora da Diretoria'; END IF;
  IF EXISTS (SELECT 1 FROM public.membros m LEFT JOIN public.setores s ON s.id = m.setor_id
              WHERE m.cliente_id = v_para AND m.setor_id IS NOT NULL AND s.cliente_id <> v_para) THEN
    RAISE EXCEPTION 'membro apontando para setor de outro projeto'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.automacoes_conteudo a JOIN public.membros m ON m.id = a.responsavel_id
                  WHERE a.cliente_id = v_para AND a.etapa = 'edicao' AND m.cliente_id = v_para AND m.nome = 'Danilo') THEN
    RAISE EXCEPTION 'automação de edição do Danilo faltando'; END IF;
END $$;
ROLLBACK;
