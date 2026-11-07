-- Vendas da Eduzz e funil (07/11/2026, Davi: "conectar com a Eduzz, ver as vendas e de onde estão vindo").
-- O mesmo link de webhook do produto passa a aceitar a Eduzz. Além de venda e reembolso, guardamos os eventos
-- do funil (Pix/boleto gerado, recusada, cancelada, carrinho abandonado) e a origem de cada um (UTMs),
-- o comprador e o meio de pagamento — para o painel de vendas do projeto. Só venda e reembolso mexem no
-- faturamento do dia (antes, qualquer tipo que não fosse venda contava como reembolso).
ALTER TABLE public.vendas_plataforma_eventos
  DROP CONSTRAINT vendas_plataforma_eventos_plataforma_check,
  ADD CONSTRAINT vendas_plataforma_eventos_plataforma_check CHECK (plataforma IN ('kiwify', 'hotmart', 'eduzz')),
  DROP CONSTRAINT vendas_plataforma_eventos_tipo_check,
  ADD CONSTRAINT vendas_plataforma_eventos_tipo_check
    CHECK (tipo IN ('venda', 'reembolso', 'pendente', 'recusada', 'cancelada', 'abandono')),
  ADD COLUMN utm_source text,
  ADD COLUMN utm_medium text,
  ADD COLUMN utm_campaign text,
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term text,
  ADD COLUMN comprador_nome text,
  ADD COLUMN comprador_email text,
  ADD COLUMN metodo_pagamento text;

CREATE OR REPLACE FUNCTION public.vendas_plataforma_somar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_venda boolean := NEW.tipo = 'venda';
BEGIN
  IF NEW.tipo NOT IN ('venda', 'reembolso') THEN
    RETURN NEW;   -- evento do funil: aparece no painel, não no faturamento
  END IF;
  INSERT INTO public.produto_financeiro_diario AS d
      (produto_id, data, receita, custos, reembolsos, vendas_quantidade, user_id)
    SELECT NEW.produto_id, NEW.data,
           CASE WHEN v_venda THEN NEW.valor ELSE 0 END, 0,
           CASE WHEN v_venda THEN 0 ELSE NEW.valor END,
           CASE WHEN v_venda THEN 1 ELSE 0 END,
           p.user_id
    FROM public.produtos_cliente p WHERE p.id = NEW.produto_id
  ON CONFLICT (produto_id, data) DO UPDATE SET
    receita = coalesce(d.receita, 0) + EXCLUDED.receita,
    reembolsos = coalesce(d.reembolsos, 0) + EXCLUDED.reembolsos,
    vendas_quantidade = coalesce(d.vendas_quantidade, 0) + EXCLUDED.vendas_quantidade;
  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS vendas_plataforma_eventos_data_idx ON public.vendas_plataforma_eventos (produto_id, data DESC);

NOTIFY pgrst, 'reload schema';
