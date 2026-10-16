-- Tarefa concluída vai sozinha para a coluna de conclusão do quadro.
-- Roy, Danilo, a execução e a Dalila só marcam `concluida = true` e não
-- mexem em `status`, então a tarefa ficava parada no Backlog. O app já
-- muda as duas coisas juntas; o gatilho cobre todo o resto.
--
-- Regra: quando `concluida` passa a true, `status` vira o `status_key` da
-- coluna `eh_conclusao` do projeto (ou das colunas pessoais do dono, se a
-- tarefa não tem projeto). Sem coluna de conclusão, nada muda.
CREATE OR REPLACE FUNCTION public.atividade_concluida_vai_para_coluna()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NEW.concluida = true AND (TG_OP = 'INSERT' OR OLD.concluida IS DISTINCT FROM true) THEN
    SELECT c.status_key INTO v_status
      FROM public.colunas_atividade c
     WHERE c.eh_conclusao
       AND (CASE WHEN NEW.cliente_id IS NOT NULL THEN c.cliente_id = NEW.cliente_id
                 ELSE c.cliente_id IS NULL AND c.user_id = NEW.user_id END)
     ORDER BY c.ordem
     LIMIT 1;
    IF v_status IS NOT NULL THEN
      NEW.status := v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atividades_concluida_coluna
BEFORE INSERT OR UPDATE OF concluida ON public.atividades
FOR EACH ROW
EXECUTE FUNCTION public.atividade_concluida_vai_para_coluna();

-- Davi Queiroz: não tinha coluna de conclusão nem a chave 'finalizado'.
INSERT INTO public.colunas_atividade (cliente_id, user_id, nome, status_key, ordem, eh_conclusao)
SELECT c.id, c.user_id, 'Finalizado', 'finalizado', 7, true
  FROM public.clientes c
 WHERE c.id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'
   AND NOT EXISTS (SELECT 1 FROM public.colunas_atividade x WHERE x.cliente_id = c.id AND x.eh_conclusao);

-- Core: 'finalizado' já é a chave da coluna "Quinta-feira", então a
-- coluna nova usa 'concluido'.
INSERT INTO public.colunas_atividade (cliente_id, user_id, nome, status_key, ordem, eh_conclusao)
SELECT c.id, c.user_id, 'Finalizado', 'concluido', 5, true
  FROM public.clientes c
 WHERE c.id = '814c070a-73cc-4604-8bec-be7520a0bddd'
   AND NOT EXISTS (SELECT 1 FROM public.colunas_atividade x WHERE x.cliente_id = c.id AND x.eh_conclusao);

-- Tarefas já concluídas fora da coluna de conclusão vão para ela de uma vez.
-- Mexe só em `status`; `concluida_em` fica como está.
UPDATE public.atividades a
   SET status = c.status_key
  FROM public.colunas_atividade c
 WHERE c.eh_conclusao
   AND c.cliente_id = a.cliente_id
   AND a.concluida
   AND a.deleted_at IS NULL
   AND a.status IS DISTINCT FROM c.status_key;
