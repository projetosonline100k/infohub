-- Regressão (22/10): o Davi tirou da agenda os carrosséis do modelo antigo (018 a 021,
-- Clássico marfim) e mandou o Roy refazer no Caderno preto. Eles só voltam à agenda
-- já refeitos (estilo Caderno preto); e não fica dois carrosséis no mesmo dia.
BEGIN;
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.carrosseis c JOIN public.estilos_carrossel e ON e.id = c.estilo_id
  WHERE c.id IN ('b2cff22c-cb86-486d-88f0-1f1396d0aca3', '7cf5f50d-493d-4fcc-bdc9-3c1b19a12af9',
    '5eb90773-dd4c-4918-af56-6c7c35d27755', '9dfadc34-b622-46f1-b854-1bd47b3710de')
    AND c.status IN ('programado', 'publicando') AND e.nome = 'Clássico marfim';
  IF v_n > 0 THEN RAISE EXCEPTION 'carrossel do modelo antigo (018-021) ainda programado: %', v_n; END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT (programado_para AT TIME ZONE 'America/Sao_Paulo')::date FROM public.carrosseis
    WHERE cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND status = 'programado'
    GROUP BY 1 HAVING count(*) > 1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'dois carrosséis programados no mesmo dia (% dias)', v_n; END IF;
END $$;
ROLLBACK;
