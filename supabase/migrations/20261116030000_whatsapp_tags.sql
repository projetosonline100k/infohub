-- Tags de lead (16/11/2026, Davi: "taguear a pessoa: quem clicou aqui não quer mais receber, quem foi pra cá ganha outra tag… e usar a tag no gatilho").
-- A tag é por lead (quiz_respostas) e vale para o projeto todo. O bloco "Tag" do fluxo do WhatsApp põe/tira; o gatilho "Tem a tag" começa o fluxo para
-- quem já tem (inclusive a base antiga); a tag reservada "nao-receber" tira a pessoa de qualquer disparo automático.
CREATE TABLE public.quiz_lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  resposta_id uuid NOT NULL REFERENCES public.quiz_respostas(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (btrim(tag) <> '' AND length(tag) <= 40 AND tag = lower(tag)),
  origem text NOT NULL DEFAULT 'manual',
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resposta_id, tag)
);
CREATE INDEX quiz_lead_tags_cliente_idx ON public.quiz_lead_tags (cliente_id, tag);
ALTER TABLE public.quiz_lead_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_lead_tags FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.quiz_lead_tags FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.quiz_lead_tags FOR SELECT TO authenticated USING (public.team_row_allowed('quiz_lead_tags', to_jsonb(quiz_lead_tags.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.quiz_lead_tags FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('quiz_lead_tags', to_jsonb(quiz_lead_tags.*), 'conteudo', 'criar')
              AND EXISTS (SELECT 1 FROM public.quiz_respostas r WHERE r.id = resposta_id AND r.cliente_id = quiz_lead_tags.cliente_id));
CREATE POLICY team_grant_delete ON public.quiz_lead_tags FOR DELETE TO authenticated USING (public.team_row_allowed('quiz_lead_tags', to_jsonb(quiz_lead_tags.*), 'conteudo', 'excluir'));
GRANT SELECT, DELETE ON public.quiz_lead_tags TO authenticated;
GRANT INSERT (cliente_id, resposta_id, tag) ON public.quiz_lead_tags TO authenticated;

-- Gatilho "tem a tag X": a mesma lógica dos outros, mas vale para a base inteira (não só para leads novos).
ALTER TABLE public.whatsapp_fluxos DROP CONSTRAINT IF EXISTS whatsapp_fluxos_gatilho_check;
ALTER TABLE public.whatsapp_fluxos ADD CONSTRAINT whatsapp_fluxos_gatilho_check CHECK (gatilho IN ('manual', 'virou_lead', 'lead_sem_compra', 'checkout_sem_compra', 'comprou', 'tag'));
ALTER TABLE public.whatsapp_fluxos ADD COLUMN gatilho_tag text CHECK (gatilho_tag IS NULL OR (btrim(gatilho_tag) <> '' AND length(gatilho_tag) <= 40));
GRANT UPDATE (gatilho_tag) ON public.whatsapp_fluxos TO authenticated;
GRANT INSERT (gatilho_tag) ON public.whatsapp_fluxos TO authenticated;
CREATE OR REPLACE FUNCTION public.whatsapp_fluxo_ativado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ativo AND (TG_OP = 'INSERT' OR NOT OLD.ativo OR NEW.gatilho IS DISTINCT FROM OLD.gatilho OR NEW.gatilho_quiz_id IS DISTINCT FROM OLD.gatilho_quiz_id OR NEW.gatilho_tag IS DISTINCT FROM OLD.gatilho_tag) THEN
    NEW.ativado_em := now();
  END IF;
  RETURN NEW;
END; $$;
NOTIFY pgrst, 'reload schema';
