-- Conversa para montar o estilo do vídeo do perfil dark (12/11/2026, Davi: "precisa ser conversa estilo chat e a gente vai montando o estilo que vamos querer para o vídeo").
-- Mesmo mecanismo da inteligência do agente do WhatsApp: o app grava o pedido, o ouvinte do Atlas responde com o Claude (o Lauro) e devolve o estilo atualizado.
ALTER TABLE public.esteira_dark_perfis
  ADD COLUMN sessao_conversa text,            -- sessão do Claude: o Lauro lembra de tudo da conversa (só o ouvinte mexe)
  ADD COLUMN conversa_zerada_em timestamptz;
GRANT UPDATE (conversa_zerada_em) ON public.esteira_dark_perfis TO authenticated;

CREATE TABLE public.esteira_dark_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.esteira_dark_perfis(id) ON DELETE CASCADE,
  user_id uuid,
  autor_id uuid,
  mensagem text NOT NULL CHECK (btrim(mensagem) <> '' AND length(mensagem) <= 60000),
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  estilo_atual jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'respondido', 'erro')),
  resposta text,
  estilo jsonb,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  respondido_em timestamptz
);
CREATE INDEX esteira_dark_pedidos_fila_idx ON public.esteira_dark_pedidos (status, criado_em) WHERE status IN ('pendente', 'processando');
CREATE INDEX esteira_dark_pedidos_perfil_idx ON public.esteira_dark_pedidos (perfil_id, criado_em);

CREATE OR REPLACE FUNCTION public.esteira_dark_pedido_autor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF auth.uid() IS NOT NULL THEN NEW.autor_id := auth.uid(); END IF; RETURN NEW; END; $$;
CREATE TRIGGER esteira_dark_pedido_autor BEFORE INSERT ON public.esteira_dark_pedidos FOR EACH ROW EXECUTE FUNCTION public.esteira_dark_pedido_autor();
ALTER TABLE public.esteira_dark_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esteira_dark_pedidos FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.esteira_dark_pedidos FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.esteira_dark_pedidos FOR SELECT TO authenticated USING (public.team_row_allowed('esteira_dark_pedidos', to_jsonb(esteira_dark_pedidos.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.esteira_dark_pedidos FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('esteira_dark_pedidos', to_jsonb(esteira_dark_pedidos.*), 'conteudo', 'criar') AND status = 'pendente' AND resposta IS NULL AND estilo IS NULL
              AND EXISTS (SELECT 1 FROM public.esteira_dark_perfis p WHERE p.id = perfil_id AND p.user_id = auth.uid()));
GRANT SELECT, INSERT ON public.esteira_dark_pedidos TO authenticated;   -- quem responde é o ouvinte (admin)
NOTIFY pgrst, 'reload schema';
