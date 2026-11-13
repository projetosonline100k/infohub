-- Agente automático do X1 (13/11/2026, Davi: "o abordar já é tudo automático: já vai mandando, o cliente vai respondendo e a Gabriela vai respondendo também").
-- Um clique em "Abordar" cria a conversa do agente com aquele lead: o robô do Mac (scripts/agente_x1.py) escreve e manda a primeira mensagem pelo WhatsApp do projeto,
-- lê o que o lead responde (whatsapp_mensagens) e responde com a inteligência do agente, até o Davi pausar/assumir, o lead pedir uma pessoa ou comprar.
CREATE TABLE public.x1_agente_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  resposta_id uuid NOT NULL REFERENCES public.quiz_respostas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  chat_id text,                          -- preenchido pelo robô: <telefone>@c.us
  conta text NOT NULL DEFAULT 'principal',
  estado text NOT NULL DEFAULT 'abordar' CHECK (estado IN ('abordar', 'conversando', 'aguardando_humano', 'pausado', 'encerrado', 'erro')),
  motivo text,
  enviadas integer NOT NULL DEFAULT 0,
  recebidas integer NOT NULL DEFAULT 0,
  cursor_em timestamptz,                 -- tudo que o lead escreveu até aqui já foi respondido
  enviados_recentes text[] NOT NULL DEFAULT '{}',   -- textos que o robô mandou (para reconhecer quando o Davi escreve por conta própria)
  ultima_acao_em timestamptz,
  trava_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resposta_id)
);
CREATE INDEX x1_agente_conversas_quiz_idx ON public.x1_agente_conversas (quiz_id, estado);
CREATE INDEX x1_agente_conversas_ativas_idx ON public.x1_agente_conversas (estado) WHERE estado IN ('abordar', 'conversando');
ALTER TABLE public.x1_agente_conversas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.x1_agente_conversas FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.x1_agente_conversas FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.x1_agente_conversas FOR SELECT TO authenticated USING (public.team_row_allowed('x1_agente_conversas', to_jsonb(x1_agente_conversas.*), 'conteudo', 'acessar'));
-- O app só COMEÇA (estado 'abordar') e depois pausa/retoma/encerra; quem escreve no WhatsApp e muda o resto é o robô.
CREATE POLICY team_grant_insert ON public.x1_agente_conversas FOR INSERT TO authenticated
  WITH CHECK (estado = 'abordar' AND public.team_row_allowed('x1_agente_conversas', to_jsonb(x1_agente_conversas.*), 'conteudo', 'criar')
              AND EXISTS (SELECT 1 FROM public.quiz_respostas r WHERE r.id = resposta_id AND r.quiz_id = x1_agente_conversas.quiz_id AND r.cliente_id = x1_agente_conversas.cliente_id));
CREATE POLICY team_grant_update ON public.x1_agente_conversas FOR UPDATE TO authenticated
  USING (public.team_row_allowed('x1_agente_conversas', to_jsonb(x1_agente_conversas.*), 'conteudo', 'editar'))
  WITH CHECK (estado IN ('abordar', 'conversando', 'pausado', 'encerrado') AND public.team_row_allowed('x1_agente_conversas', to_jsonb(x1_agente_conversas.*), 'conteudo', 'editar'));
GRANT SELECT, INSERT ON public.x1_agente_conversas TO authenticated;
GRANT UPDATE (estado, motivo, atualizado_em) ON public.x1_agente_conversas TO authenticated;
GRANT INSERT (quiz_id, resposta_id, cliente_id, estado) ON public.x1_agente_conversas TO authenticated;
-- Retomar/reabordar: o cursor volta para agora (o que ficou sem resposta durante a pausa não vira rajada de mensagens).
CREATE FUNCTION public.x1_agente_estado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'conversando' AND OLD.estado IN ('pausado', 'aguardando_humano', 'erro') THEN
    NEW.cursor_em := now();
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER x1_agente_estado BEFORE UPDATE ON public.x1_agente_conversas FOR EACH ROW EXECUTE FUNCTION public.x1_agente_estado();

-- Chave geral de segurança: desliga o agente automático do projeto inteiro de uma vez.
ALTER TABLE public.agentes_whatsapp ADD COLUMN automatico boolean NOT NULL DEFAULT true;
GRANT UPDATE (automatico) ON public.agentes_whatsapp TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.x1_agente_conversas;
NOTIFY pgrst, 'reload schema';
