-- Conversa sobre a entrega (pedido do Davi, 15/10/2026): na revisão do
-- documento ele quer conversar com o funcionário ("elogiar, falar que gostei,
-- reforçar o que deve se manter"), não só pedir ajuste. Reaproveita o
-- briefing: status 'revisando', ligado à tarefa entregue (atividade_id). O
-- ouvinte do Jarvis responde como o funcionário, anota o reforço nos
-- aprendizados e, se o Davi pedir mudança, atualiza o mesmo documento.
ALTER TABLE public.briefings DROP CONSTRAINT briefings_status_check;
ALTER TABLE public.briefings ADD CONSTRAINT briefings_status_check
  CHECK (status IN ('conversando', 'revisando', 'confirmado', 'cancelado'));

-- O app abre a conversa já ligada à tarefa.
GRANT INSERT (atividade_id, status) ON public.briefings TO authenticated;

-- Funcionário e tarefa do mesmo projeto do briefing; pelo app, a conversa nasce
-- 'conversando' (pedido novo) ou 'revisando' (com a tarefa).
CREATE OR REPLACE FUNCTION public.briefing_confere_membro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM membros WHERE id = NEW.membro_id AND cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'funcionário não é deste projeto';
  END IF;
  IF NEW.atividade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atividades WHERE id = NEW.atividade_id AND cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'tarefa não é deste projeto';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('conversando', 'revisando') THEN
    RAISE EXCEPTION 'conversa nova começa conversando ou revisando';
  END IF;
  IF NEW.status = 'revisando' AND NEW.atividade_id IS NULL THEN
    RAISE EXCEPTION 'revisão precisa da tarefa';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
