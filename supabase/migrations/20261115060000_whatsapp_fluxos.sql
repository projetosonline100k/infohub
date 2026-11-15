-- Fluxos de mensagem no WhatsApp (15/11/2026, Davi: "criar fluxos de mensagens também no WhatsApp, tipo o Many Hub").
-- O mesmo desenho de blocos do Many Hub (mensagem, esperar, condição, fim), mas rodando no WhatsApp do projeto: o robô do Mac (scripts/fluxo_whatsapp.py)
-- manda cada mensagem pelo WAHA, espera o tempo e segue pelo caminho da resposta (a lista de opções vira "1) …, 2) …" e a pessoa responde o número ou o texto).
-- Começa quando o Davi clica em "Iniciar fluxo" no chat do lead (X1) e para sozinho se ele pausar, escrever na conversa ou o fluxo acabar.
CREATE TABLE public.whatsapp_fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 120),
  ativo boolean NOT NULL DEFAULT false,
  grafo jsonb NOT NULL DEFAULT '{"nos":[{"id":"inicio","tipo":"inicio","x":0,"y":0,"dados":{}}],"ligacoes":[]}'::jsonb
    CHECK (jsonb_typeof(grafo->'nos') = 'array' AND jsonb_typeof(grafo->'ligacoes') = 'array' AND length(grafo::text) < 400000),
  disparos integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_fluxos_cliente_idx ON public.whatsapp_fluxos (cliente_id, ativo);
ALTER TABLE public.whatsapp_fluxos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_fluxos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.whatsapp_fluxos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.whatsapp_fluxos FOR SELECT TO authenticated USING (public.team_row_allowed('whatsapp_fluxos', to_jsonb(whatsapp_fluxos.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.whatsapp_fluxos FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('whatsapp_fluxos', to_jsonb(whatsapp_fluxos.*), 'conteudo', 'criar'));
CREATE POLICY team_grant_update ON public.whatsapp_fluxos FOR UPDATE TO authenticated
  USING (public.team_row_allowed('whatsapp_fluxos', to_jsonb(whatsapp_fluxos.*), 'conteudo', 'editar'))
  WITH CHECK (public.team_row_allowed('whatsapp_fluxos', to_jsonb(whatsapp_fluxos.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.whatsapp_fluxos FOR DELETE TO authenticated USING (public.team_row_allowed('whatsapp_fluxos', to_jsonb(whatsapp_fluxos.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, DELETE ON public.whatsapp_fluxos TO authenticated;
GRANT UPDATE (nome, ativo, grafo, atualizado_em) ON public.whatsapp_fluxos TO authenticated;   -- disparos: só o robô

-- A caminhada de UM lead por um fluxo.
CREATE TABLE public.whatsapp_fluxo_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id uuid NOT NULL REFERENCES public.whatsapp_fluxos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  resposta_id uuid NOT NULL REFERENCES public.quiz_respostas(id) ON DELETE CASCADE,
  chat_id text,
  conta text NOT NULL DEFAULT 'principal',
  no_atual text,
  estado text NOT NULL DEFAULT 'iniciar' CHECK (estado IN ('iniciar', 'rodando', 'aguardando_resposta', 'aguardando_tempo', 'pausado', 'fim', 'parado', 'erro')),
  proximo_em timestamptz,
  cursor_em timestamptz,              -- o que o lead escreveu antes disto já foi tratado
  enviados_recentes text[] NOT NULL DEFAULT '{}',
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{no, tipo, em}]
  motivo text,
  trava_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_fluxo_exec_ativas_idx ON public.whatsapp_fluxo_execucoes (estado) WHERE estado IN ('iniciar', 'rodando', 'aguardando_resposta', 'aguardando_tempo');
CREATE INDEX whatsapp_fluxo_exec_lead_idx ON public.whatsapp_fluxo_execucoes (resposta_id, criado_em);
ALTER TABLE public.whatsapp_fluxo_execucoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_fluxo_execucoes FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.whatsapp_fluxo_execucoes FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.whatsapp_fluxo_execucoes FOR SELECT TO authenticated USING (public.team_row_allowed('whatsapp_fluxo_execucoes', to_jsonb(whatsapp_fluxo_execucoes.*), 'conteudo', 'acessar'));
-- O app só COMEÇA (estado 'iniciar', de um fluxo ativo do mesmo projeto, para um lead do mesmo projeto) e depois pausa/retoma/para; o robô faz o resto.
CREATE POLICY team_grant_insert ON public.whatsapp_fluxo_execucoes FOR INSERT TO authenticated
  WITH CHECK (estado = 'iniciar' AND public.team_row_allowed('whatsapp_fluxo_execucoes', to_jsonb(whatsapp_fluxo_execucoes.*), 'conteudo', 'criar')
              AND EXISTS (SELECT 1 FROM public.whatsapp_fluxos f WHERE f.id = fluxo_id AND f.cliente_id = whatsapp_fluxo_execucoes.cliente_id AND f.ativo)
              AND EXISTS (SELECT 1 FROM public.quiz_respostas r WHERE r.id = resposta_id AND r.cliente_id = whatsapp_fluxo_execucoes.cliente_id));
CREATE POLICY team_grant_update ON public.whatsapp_fluxo_execucoes FOR UPDATE TO authenticated
  USING (public.team_row_allowed('whatsapp_fluxo_execucoes', to_jsonb(whatsapp_fluxo_execucoes.*), 'conteudo', 'editar'))
  WITH CHECK (estado IN ('pausado', 'parado', 'rodando') AND public.team_row_allowed('whatsapp_fluxo_execucoes', to_jsonb(whatsapp_fluxo_execucoes.*), 'conteudo', 'editar'));
GRANT SELECT, INSERT (fluxo_id, cliente_id, resposta_id, estado) ON public.whatsapp_fluxo_execucoes TO authenticated;
GRANT UPDATE (estado, motivo, atualizado_em) ON public.whatsapp_fluxo_execucoes TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_fluxo_execucoes;
NOTIFY pgrst, 'reload schema';
