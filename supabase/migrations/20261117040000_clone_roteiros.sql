-- Roteiros do Instalivros que viram vídeo no Core Clone (17/11/2026, Davi: "dentro do editor do instalivros, eu preciso conseguir subir somente o roteiro,
-- tanto sozinho quanto vários, e você já começar a gerar os vídeos, aguardar, baixar e aí sim começar a editar").
-- O app grava o roteiro (status 'fila'); o Mac (scripts/danilo/clone.py, Chrome do Davi logado em clone.corestudio.ai) manda para "Roteiros prontos",
-- espera ficarem prontos, baixa o mp4 para Para o Danilo/Instalivros e o Danilo edita como qualquer bruto.
CREATE TABLE public.clone_roteiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  lote_id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (length(titulo) <= 160),
  roteiro text NOT NULL CHECK (length(roteiro) BETWEEN 20 AND 12000),
  perfil text NOT NULL DEFAULT 'BookMan-1-Dia' CHECK (length(perfil) <= 80),
  status text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila', 'enviando', 'gerando', 'baixando', 'baixado', 'erro', 'cancelado')),
  mensagem text,
  video_url text,
  arquivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  baixado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clone_roteiros_cliente_idx ON public.clone_roteiros (cliente_id, criado_em DESC);
CREATE INDEX clone_roteiros_status_idx ON public.clone_roteiros (status) WHERE status IN ('fila', 'enviando', 'gerando', 'baixando');

ALTER TABLE public.clone_roteiros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clone_roteiros FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.clone_roteiros FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.clone_roteiros FOR SELECT TO authenticated USING (public.team_row_allowed('clone_roteiros', to_jsonb(clone_roteiros.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.clone_roteiros FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed('clone_roteiros', to_jsonb(clone_roteiros.*), 'conteudo', 'criar') AND status = 'fila');
-- O app só cancela o que ainda não saiu da fila e tenta de novo o que deu erro; o resto é do robô.
CREATE POLICY team_grant_update ON public.clone_roteiros FOR UPDATE TO authenticated
  USING (status IN ('fila', 'erro') AND public.team_row_allowed('clone_roteiros', to_jsonb(clone_roteiros.*), 'conteudo', 'editar'))
  WITH CHECK (status IN ('cancelado', 'fila') AND public.team_row_allowed('clone_roteiros', to_jsonb(clone_roteiros.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.clone_roteiros FOR DELETE TO authenticated USING (public.team_row_allowed('clone_roteiros', to_jsonb(clone_roteiros.*), 'conteudo', 'excluir'));
GRANT SELECT, DELETE ON public.clone_roteiros TO authenticated;
GRANT INSERT (cliente_id, lote_id, titulo, roteiro, perfil) ON public.clone_roteiros TO authenticated;
GRANT UPDATE (status, mensagem) ON public.clone_roteiros TO authenticated;
