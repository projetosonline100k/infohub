-- Edições do Danilo (editor IA): cada vídeo que ele edita vira uma linha.
-- O vídeo e o projeto de edição ficam no Mac do Davi
-- (~/.infopro-hub/danilo/edicoes/<id>), servidos pelo serviço local do Danilo
-- (scripts/danilo/servidor.py); aqui fica só o andamento, pro Infopro mostrar
-- e pro mini editor achar a edição.
CREATE TABLE public.edicoes_video (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  video_vertical_id uuid REFERENCES public.videos_vertical(id) ON DELETE SET NULL,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  status text NOT NULL DEFAULT 'na_fila'
    CHECK (status IN ('na_fila', 'editando', 'revisar', 'renderizando', 'aprovando', 'aprovado', 'erro')),
  mensagem text,                 -- o que está acontecendo / motivo do erro
  bruto_drive text,              -- caminho do bruto no Drive (no Mac)
  final_drive text,              -- onde o MP4 aprovado foi entregue
  duracao numeric,
  versao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edicoes_video_cliente_idx ON public.edicoes_video (cliente_id, status);

ALTER TABLE public.edicoes_video ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edicoes_video FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.edicoes_video
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.edicoes_video FOR SELECT TO authenticated
  USING (public.team_row_allowed('edicoes_video', to_jsonb(edicoes_video.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_update ON public.edicoes_video FOR UPDATE TO authenticated
  USING (public.team_row_allowed('edicoes_video', to_jsonb(edicoes_video.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('edicoes_video', to_jsonb(edicoes_video.*), 'atividades', 'editar'));
-- Quem cria e avança as edições é o serviço do Danilo (conexão de admin);
-- o app só lê e marca o andamento (ex.: pediu nova versão).
GRANT SELECT, UPDATE (status, mensagem) ON public.edicoes_video TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.edicoes_video;
NOTIFY pgrst, 'reload schema';
