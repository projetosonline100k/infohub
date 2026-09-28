-- "Tarefas concluídas hoje" (Encerrar o dia) precisa saber QUANDO uma
-- tarefa foi concluída — `concluida` sempre foi só um booleano, mexido em
-- pelo menos 5 pontos diferentes do código (AtividadesView, AtividadesClientesView,
-- MindMapEditor, SubtarefasList, useAssistantAtividades, além de arrasto
-- pro Kanban). Em vez de caçar e alterar cada um desses pontos (e correr o
-- risco de esquecer um sexto no futuro), um trigger cobre todos de graça.
--
-- Limitação importante, documentada aqui pra não ser esquecida: isto só
-- fica preciso a partir de quando esta migration for aplicada. Tarefas já
-- concluídas antes disso ficam com concluida_em NULL pra sempre — não dá
-- pra inferir a data real de conclusão de forma confiável (updated_at pode
-- ter mudado por qualquer outro motivo depois). "Tarefas concluídas hoje"
-- pra datas anteriores ao deploy deve ser tratado como dado inexistente,
-- nunca como zero.
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS concluida_em timestamptz;

CREATE OR REPLACE FUNCTION public.set_atividade_concluida_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.concluida = true AND (OLD IS NULL OR OLD.concluida IS DISTINCT FROM true) THEN
    NEW.concluida_em := now();
  ELSIF NEW.concluida = false AND OLD IS NOT NULL AND OLD.concluida = true THEN
    NEW.concluida_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atividades_concluida_em
BEFORE INSERT OR UPDATE ON public.atividades
FOR EACH ROW
EXECUTE FUNCTION public.set_atividade_concluida_em();
