-- Kanban do Pedro (pedido do Davi, 16/10/2026): "sempre fique trazendo ideias
-- do que melhorar … colocando algum destaque no card, pra eu identificar que é
-- novo. Crie também uma nova coluna, onde eu jogue para não é prioridade agora,
-- dessa forma a gente não perde as ideias". O Pedro busca sozinho a cada 30 min
-- (ouvinte, linha "rodada"; scripts/pedro/melhorias.py).
--
-- 1) Status 'adiada' = coluna "Não é prioridade agora" (o Davi arrasta pra lá e de volta).
ALTER TABLE public.melhorias_sistema DROP CONSTRAINT melhorias_sistema_status_check;
ALTER TABLE public.melhorias_sistema ADD CONSTRAINT melhorias_sistema_status_check
  CHECK (status IN ('ideia', 'pode_fazer', 'fazendo', 'pendente', 'feito', 'descartada', 'erro', 'adiada'));

-- 2) Selo NOVO: `visto_em` vazio = o Davi ainda não abriu o cartão. Ideia do
-- próprio Davi já nasce vista; o que já estava no quadro conta como visto.
ALTER TABLE public.melhorias_sistema ADD COLUMN visto_em timestamptz;
UPDATE public.melhorias_sistema SET visto_em = now();
GRANT UPDATE (visto_em) ON public.melhorias_sistema TO authenticated;

CREATE OR REPLACE FUNCTION public.melhoria_atualiza()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.origem = 'davi' THEN
    NEW.visto_em := coalesce(NEW.visto_em, now());
  END IF;
  -- Só abrir o cartão (visto_em) não conta como mudança: não vira aviso.
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) - 'visto_em' - 'atualizado_em' = to_jsonb(OLD) - 'visto_em' - 'atualizado_em' THEN
    RETURN NEW;
  END IF;
  NEW.atualizado_em := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'fazendo' THEN NEW.iniciado_em := now(); END IF;
    IF NEW.status IN ('feito', 'erro') THEN NEW.concluido_em := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) O app também move pra "Não é prioridade agora" (e de lá pra Ideias / Pode fazer).
CREATE OR REPLACE FUNCTION public.melhoria_confere_app()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND (NEW.status <> 'ideia' OR NEW.origem <> 'davi') THEN
      RAISE EXCEPTION 'pelo app a ideia entra como ideia do Davi';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND (NEW.status NOT IN ('ideia', 'pode_fazer', 'descartada', 'adiada') OR OLD.status = 'fazendo') THEN
      RAISE EXCEPTION 'esse passo é do Pedro';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
