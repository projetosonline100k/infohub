-- Limpa o projeto Core duplicado: o 'CORE' vazio (sem tarefas, vídeos,
-- produtos nem documentos) é arquivado e o 'Core ' perde o espaço do fim.
-- E daqui em diante o nome do projeto entra sem espaço nas pontas.

UPDATE public.clientes
   SET arquivado = true
 WHERE id = '7a32f558-8ccb-45a8-999a-c8e52bd53730'
   AND nome_especialista = 'CORE'
   AND NOT EXISTS (SELECT 1 FROM public.atividades a WHERE a.cliente_id = clientes.id)
   AND NOT EXISTS (SELECT 1 FROM public.videos_vertical v WHERE v.cliente_id = clientes.id)
   AND NOT EXISTS (SELECT 1 FROM public.documentos d WHERE d.cliente_id = clientes.id);

UPDATE public.clientes
   SET nome_especialista = btrim(nome_especialista)
 WHERE nome_especialista <> btrim(nome_especialista);

CREATE OR REPLACE FUNCTION public.clientes_nome_sem_espaco()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.nome_especialista := btrim(NEW.nome_especialista);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_nome_sem_espaco ON public.clientes;
CREATE TRIGGER clientes_nome_sem_espaco
  BEFORE INSERT OR UPDATE OF nome_especialista ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_nome_sem_espaco();
