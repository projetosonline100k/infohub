-- Faturamento entrando sozinho (melhoria do Pedro, 15/10/2026).
-- Cada produto ganha um link de webhook próprio (com uma chave secreta). A
-- Kiwify ou a Hotmart chamam a edge function `vendas-webhook` a cada venda ou
-- reembolso; ela grava o evento em vendas_plataforma_eventos e o trigger soma
-- no dia certo de produto_financeiro_diario (o mesmo lugar do lançamento à mão,
-- que continua funcionando). O evento repetido (a plataforma reenvia) é
-- ignorado pela chave única (plataforma, transação, tipo).
CREATE TABLE public.produto_vendas_webhook (
  produto_id uuid PRIMARY KEY REFERENCES public.produtos_cliente(id) ON DELETE CASCADE,
  chave text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.produto_vendas_webhook ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.produto_vendas_webhook FROM anon, authenticated;

CREATE TABLE public.vendas_plataforma_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos_cliente(id) ON DELETE CASCADE,
  plataforma text NOT NULL CHECK (plataforma IN ('kiwify', 'hotmart')),
  transacao_id text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('venda', 'reembolso')),
  valor numeric NOT NULL DEFAULT 0,  -- em reais, o que o comprador pagou
  data date NOT NULL,                -- dia em que entra (horário de Brasília)
  produto_plataforma text,           -- nome do produto na plataforma
  payload jsonb,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plataforma, transacao_id, tipo)
);
CREATE INDEX vendas_plataforma_eventos_produto_idx ON public.vendas_plataforma_eventos (produto_id, recebido_em DESC);

ALTER TABLE public.vendas_plataforma_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendas_plataforma_eventos FROM anon, authenticated;
GRANT SELECT ON public.vendas_plataforma_eventos TO authenticated;
CREATE POLICY "dono_le" ON public.vendas_plataforma_eventos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.produtos_cliente p
                 WHERE p.id = produto_id AND p.user_id = auth.uid()));

-- Soma o evento no dia do produto (cria a linha do dia se não existir).
CREATE FUNCTION public.vendas_plataforma_somar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_venda boolean := NEW.tipo = 'venda';
BEGIN
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
REVOKE ALL ON FUNCTION public.vendas_plataforma_somar() FROM public, anon, authenticated;
CREATE TRIGGER vendas_plataforma_somar AFTER INSERT ON public.vendas_plataforma_eventos
  FOR EACH ROW EXECUTE FUNCTION public.vendas_plataforma_somar();

-- A tela pede o link do produto: cria a chave na primeira vez. Só o dono.
CREATE FUNCTION public.produto_vendas_webhook_chave(p_produto uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chave text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.produtos_cliente WHERE id = p_produto AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'produto não encontrado' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.produto_vendas_webhook(produto_id) VALUES (p_produto) ON CONFLICT DO NOTHING;
  SELECT chave INTO v_chave FROM public.produto_vendas_webhook WHERE produto_id = p_produto;
  RETURN v_chave;
END;
$$;
REVOKE ALL ON FUNCTION public.produto_vendas_webhook_chave(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.produto_vendas_webhook_chave(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
