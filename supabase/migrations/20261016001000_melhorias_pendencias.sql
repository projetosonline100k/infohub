-- Kanban do Pedro (pedido do Davi, 16/10/2026): "caso tenha alguma coisa que
-- dependa de mim… uma coluna pendências, onde ele me mostra um check do que eu
-- preciso fazer, e um chat dele para a gente já ir implementando".
--
-- 1) Status 'pendente' + a lista de pendências [{texto, feito}] (o Davi marca).
ALTER TABLE public.melhorias_sistema DROP CONSTRAINT melhorias_sistema_status_check;
ALTER TABLE public.melhorias_sistema ADD CONSTRAINT melhorias_sistema_status_check
  CHECK (status IN ('ideia', 'pode_fazer', 'fazendo', 'pendente', 'feito', 'descartada', 'erro'));
ALTER TABLE public.melhorias_sistema ADD COLUMN pendencias jsonb;
GRANT UPDATE (pendencias) ON public.melhorias_sistema TO authenticated;

-- O app pode tirar de "pendente" (de volta pra "Pode fazer" = "pode continuar").
CREATE OR REPLACE FUNCTION public.melhoria_confere_app()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND (NEW.status <> 'ideia' OR NEW.origem <> 'davi') THEN
      RAISE EXCEPTION 'pelo app a ideia entra como ideia do Davi';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND (NEW.status NOT IN ('ideia', 'pode_fazer', 'descartada') OR OLD.status = 'fazendo') THEN
      RAISE EXCEPTION 'esse passo é do Pedro';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) A conversa (briefing 'revisando') também pode ser sobre uma melhoria.
ALTER TABLE public.briefings ADD COLUMN melhoria_id uuid REFERENCES public.melhorias_sistema(id) ON DELETE CASCADE;
GRANT INSERT (melhoria_id) ON public.briefings TO authenticated;

CREATE OR REPLACE FUNCTION public.briefing_confere_membro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM membros WHERE id = NEW.membro_id AND cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'funcionário não é deste projeto';
  END IF;
  IF NEW.atividade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atividades WHERE id = NEW.atividade_id AND cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'tarefa não é deste projeto';
  END IF;
  IF NEW.melhoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM melhorias_sistema WHERE id = NEW.melhoria_id AND cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'melhoria não é deste projeto';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('conversando', 'revisando') THEN
    RAISE EXCEPTION 'conversa nova começa conversando ou revisando';
  END IF;
  IF NEW.status = 'revisando' AND NEW.atividade_id IS NULL AND NEW.melhoria_id IS NULL THEN
    RAISE EXCEPTION 'revisão precisa da tarefa';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
