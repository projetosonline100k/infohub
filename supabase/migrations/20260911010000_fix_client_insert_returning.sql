-- INSERT RETURNING avalia SELECT antes de a nova linha ficar visível
-- às consultas da função STABLE team_allowed. Confira o proprietário
-- diretamente na linha, preservando a verificação de equipe para os demais.
CREATE OR REPLACE FUNCTION public.team_row_allowed(table_name text, row_data jsonb, area text, action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid;
BEGIN
  target := public.team_row_client(table_name, row_data);
  IF target IS NULL THEN RETURN (row_data->>'user_id')::uuid = auth.uid(); END IF;
  IF table_name = 'clientes' AND (action = 'criar' OR (row_data->>'user_id')::uuid = auth.uid()) THEN
    RETURN (row_data->>'user_id')::uuid = auth.uid();
  END IF;
  IF table_name = 'equipe_cliente' THEN
    RETURN EXISTS (SELECT 1 FROM public.clientes WHERE id = target AND user_id = auth.uid());
  END IF;
  RETURN public.team_allowed(target, area, action);
END;
$$;
