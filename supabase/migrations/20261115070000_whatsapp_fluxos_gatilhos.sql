-- Gatilhos de negócio nos fluxos do WhatsApp (15/11/2026, Davi: "a pessoa virou lead e não comprou → X; a pessoa comprou → Y"): o robô olha os leads do projeto e
-- começa o fluxo sozinho quando o acontecimento (e a espera escolhida) se cumpre. Só vale para leads que chegaram DEPOIS de o fluxo ser ligado (não dispara em cima da base antiga).
ALTER TABLE public.whatsapp_fluxos
  ADD COLUMN gatilho text NOT NULL DEFAULT 'manual' CHECK (gatilho IN ('manual', 'virou_lead', 'lead_sem_compra', 'checkout_sem_compra', 'comprou')),
  ADD COLUMN gatilho_espera_min integer NOT NULL DEFAULT 0 CHECK (gatilho_espera_min >= 0 AND gatilho_espera_min <= 43200),
  ADD COLUMN gatilho_quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL,   -- NULL = qualquer quiz do projeto
  ADD COLUMN ativado_em timestamptz;
GRANT UPDATE (gatilho, gatilho_espera_min, gatilho_quiz_id) ON public.whatsapp_fluxos TO authenticated;
GRANT INSERT (gatilho, gatilho_espera_min, gatilho_quiz_id) ON public.whatsapp_fluxos TO authenticated;

-- "Ativado desde": a hora em que o fluxo foi ligado (ou o gatilho mudou). Só lead criado depois disso entra por gatilho.
CREATE OR REPLACE FUNCTION public.whatsapp_fluxo_ativado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ativo AND (TG_OP = 'INSERT' OR NOT OLD.ativo OR NEW.gatilho IS DISTINCT FROM OLD.gatilho OR NEW.gatilho_quiz_id IS DISTINCT FROM OLD.gatilho_quiz_id) THEN
    NEW.ativado_em := now();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER whatsapp_fluxo_ativado BEFORE INSERT OR UPDATE ON public.whatsapp_fluxos FOR EACH ROW EXECUTE FUNCTION public.whatsapp_fluxo_ativado();

-- Cada lead entra uma vez só por gatilho (o início manual pode repetir).
ALTER TABLE public.whatsapp_fluxo_execucoes ADD COLUMN origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'gatilho'));
CREATE UNIQUE INDEX whatsapp_fluxo_exec_gatilho_uq ON public.whatsapp_fluxo_execucoes (fluxo_id, resposta_id) WHERE origem = 'gatilho';
NOTIFY pgrst, 'reload schema';
