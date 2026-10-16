-- Tempo estimado de quem está fazendo (pedido do Davi, 15/10/2026: "além da
-- porcentagem, o tempo estimado"). `andamento_desde`: quando a tarefa entrou
-- em andamento (o app calcula o ritmo: tempo até aqui ÷ % feita). `previsao_fim`:
-- quando o próprio funcionário acha que termina (IA informa no progresso).
ALTER TABLE public.atividades ADD COLUMN andamento_desde timestamptz;
ALTER TABLE public.atividades ADD COLUMN previsao_fim timestamptz;

CREATE OR REPLACE FUNCTION public.atividade_marca_andamento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.situacao = 'andamento' AND (TG_OP = 'INSERT' OR OLD.situacao IS DISTINCT FROM 'andamento') THEN
    NEW.andamento_desde := now();
    IF TG_OP = 'UPDATE' AND NEW.previsao_fim IS NOT DISTINCT FROM OLD.previsao_fim THEN NEW.previsao_fim := NULL; END IF;
  ELSIF NEW.situacao IS DISTINCT FROM 'andamento' AND TG_OP = 'UPDATE' AND OLD.situacao = 'andamento' THEN
    NEW.previsao_fim := NULL;   -- saiu de andamento: a previsão não vale mais
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER atividade_marca_andamento BEFORE INSERT OR UPDATE OF situacao ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.atividade_marca_andamento();

-- O que já está em andamento agora começa a contar daqui.
UPDATE public.atividades SET andamento_desde = now() WHERE situacao = 'andamento' AND andamento_desde IS NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
