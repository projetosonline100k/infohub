-- X1 (14/11/2026, Davi: "o agente primeiro mostra a mensagem que vai mandar; eu aprovo e ele manda, ou vamos ajustando até ficar boa e aí ele dispara").
-- Com `exigir_aprovacao` ligado (padrão), o agente não envia direto: grava uma PROPOSTA (x1_agente_propostas) e a conversa fica em 'aprovacao'.
-- O Davi edita o texto, pede ajustes (o agente reescreve), aprova (o robô do Mac envia) ou descarta (a conversa pausa).
ALTER TABLE public.agentes_whatsapp ADD COLUMN exigir_aprovacao boolean NOT NULL DEFAULT true;
GRANT UPDATE (exigir_aprovacao) ON public.agentes_whatsapp TO authenticated;

ALTER TABLE public.x1_agente_conversas DROP CONSTRAINT x1_agente_conversas_estado_check;
ALTER TABLE public.x1_agente_conversas ADD CONSTRAINT x1_agente_conversas_estado_check
  CHECK (estado IN ('abordar', 'conversando', 'aprovacao', 'aguardando_humano', 'pausado', 'encerrado', 'erro'));

CREATE TABLE public.x1_agente_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.x1_agente_conversas(id) ON DELETE CASCADE,
  resposta_id uuid NOT NULL REFERENCES public.quiz_respostas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('abertura', 'resposta')),
  lead_disse text,
  raciocinio text,
  mensagens text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'revisando', 'descartada', 'enviada', 'substituida')),
  instrucao text,                                  -- pedido de ajuste do Davi (o robô reescreve e limpa)
  ajustes jsonb NOT NULL DEFAULT '[]',             -- conversa de ajuste: [{papel: 'davi'|'agente', texto}]
  versao integer NOT NULL DEFAULT 1,
  cursor_novo timestamptz,                         -- quando enviada, o cursor da conversa vai para aqui
  recebidas_novas integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX x1_agente_propostas_resposta_idx ON public.x1_agente_propostas (resposta_id, criado_em);
CREATE INDEX x1_agente_propostas_abertas_idx ON public.x1_agente_propostas (status) WHERE status IN ('pendente', 'aprovada', 'revisando');
ALTER TABLE public.x1_agente_propostas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.x1_agente_propostas FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.x1_agente_propostas FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.x1_agente_propostas FOR SELECT TO authenticated
  USING (public.team_row_allowed('x1_agente_propostas', to_jsonb(x1_agente_propostas.*), 'conteudo', 'acessar'));
-- O app só mexe em proposta pendente: edita o texto, pede ajuste, aprova ou descarta. Quem cria e envia é o robô.
CREATE POLICY team_grant_update ON public.x1_agente_propostas FOR UPDATE TO authenticated
  USING (status = 'pendente' AND public.team_row_allowed('x1_agente_propostas', to_jsonb(x1_agente_propostas.*), 'conteudo', 'editar'))
  WITH CHECK (status IN ('pendente', 'aprovada', 'revisando', 'descartada') AND public.team_row_allowed('x1_agente_propostas', to_jsonb(x1_agente_propostas.*), 'conteudo', 'editar'));
GRANT SELECT ON public.x1_agente_propostas TO authenticated;
GRANT UPDATE (status, mensagens, instrucao, atualizado_em) ON public.x1_agente_propostas TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.x1_agente_propostas;
NOTIFY pgrst, 'reload schema';
