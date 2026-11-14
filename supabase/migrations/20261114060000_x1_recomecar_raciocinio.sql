-- X1 (14/11/2026, Davi: "opção de recomeçar também no WhatsApp, porque estou treinando; e um chat do lado mostrando o raciocínio").
-- 1) Recomeçar: o app grava estado 'abordar' + motivo '__recomecar__'; o gatilho zera os contadores e marca `recomecou_em`: o agente esquece o que veio antes
--    (o histórico que ele lê começa aí) e abre a conversa de novo. As mensagens reais continuam no WhatsApp; só o agente passa a ignorá-las.
-- 2) Raciocínio: a cada resposta, o agente grava por que escreveu aquilo (x1_agente_raciocinio); a tela mostra ao lado do chat.
ALTER TABLE public.x1_agente_conversas ADD COLUMN recomecou_em timestamptz;

CREATE OR REPLACE FUNCTION public.x1_agente_estado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'abordar' AND NEW.motivo = '__recomecar__' THEN
    NEW.recomecou_em := now();
    NEW.cursor_em := now();
    NEW.enviadas := 0;
    NEW.recebidas := 0;
    NEW.enviados_recentes := '{}';
    NEW.motivo := NULL;
    NEW.trava_ate := NULL;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'conversando' AND OLD.estado IN ('pausado', 'aguardando_humano', 'erro') THEN
    NEW.cursor_em := now();
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END; $$;

CREATE TABLE public.x1_agente_raciocinio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.x1_agente_conversas(id) ON DELETE CASCADE,
  resposta_id uuid NOT NULL REFERENCES public.quiz_respostas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  lead_disse text,
  raciocinio text NOT NULL,
  mensagens text[] NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX x1_agente_raciocinio_resposta_idx ON public.x1_agente_raciocinio (resposta_id, criado_em);
ALTER TABLE public.x1_agente_raciocinio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.x1_agente_raciocinio FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.x1_agente_raciocinio FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.x1_agente_raciocinio FOR SELECT TO authenticated USING (public.team_row_allowed('x1_agente_raciocinio', to_jsonb(x1_agente_raciocinio.*), 'conteudo', 'acessar'));
GRANT SELECT ON public.x1_agente_raciocinio TO authenticated;   -- só o robô escreve
NOTIFY pgrst, 'reload schema';
