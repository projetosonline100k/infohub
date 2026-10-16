-- Desfazer uma venda automática (ex.: o "testar webhook" da Kiwify/Hotmart):
-- tira o valor do dia do produto e apaga o evento. Só o dono do produto.
CREATE FUNCTION public.vendas_plataforma_desfazer(p_evento uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.vendas_plataforma_eventos;
BEGIN
  SELECT ev.* INTO e FROM public.vendas_plataforma_eventos ev
    JOIN public.produtos_cliente p ON p.id = ev.produto_id
   WHERE ev.id = p_evento AND p.user_id = auth.uid();
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'evento não encontrado' USING ERRCODE = '42501';
  END IF;
  UPDATE public.produto_financeiro_diario SET
    receita = CASE WHEN e.tipo = 'venda' THEN coalesce(receita, 0) - e.valor ELSE receita END,
    reembolsos = CASE WHEN e.tipo = 'reembolso' THEN coalesce(reembolsos, 0) - e.valor ELSE reembolsos END,
    vendas_quantidade = CASE WHEN e.tipo = 'venda' THEN greatest(coalesce(vendas_quantidade, 0) - 1, 0)
                             ELSE vendas_quantidade END
   WHERE produto_id = e.produto_id AND data = e.data;
  DELETE FROM public.vendas_plataforma_eventos WHERE id = e.id;
END;
$$;
REVOKE ALL ON FUNCTION public.vendas_plataforma_desfazer(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendas_plataforma_desfazer(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
