-- Liga o relatório noturno ("Encerrar o dia") ao plano matinal ("Começar o
-- dia"), quando ele existir, e registra quantas das até-3 atividades do
-- 80/20 foram concluídas no dia — aditivo, tudo nullable, não quebra
-- relatórios antigos (que nunca tiveram um plano).
ALTER TABLE public.daily_productivity_reports
  ADD COLUMN daily_plan_id uuid REFERENCES public.daily_plans(id) ON DELETE SET NULL,
  ADD COLUMN eighty_twenty_completed_count smallint,
  ADD COLUMN eighty_twenty_total_count smallint;
