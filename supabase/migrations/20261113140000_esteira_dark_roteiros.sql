-- Roteiros dos vídeos dark (13/11/2026, Davi, com um desenho: "eu subo o roteiro, o Lauro faz o resto; visualização estilo calendário, com o status embaixo de cada roteiro").
-- Cada perfil da esteira dark tem uma lista de roteiros (V1, V2…), cada um com o dia de postagem e o status: na fila → editando → programando → programado.
-- Quem sobe o roteiro é o Davi; o status e o arquivo do vídeo são atualizados pelo Lauro (ouvinte, via scripts/lauro/roteiros.py).
CREATE TABLE public.esteira_dark_roteiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.esteira_dark_perfis(id) ON DELETE CASCADE,
  user_id uuid,
  numero integer NOT NULL,
  titulo text NOT NULL CHECK (btrim(titulo) <> '' AND length(titulo) <= 160),
  texto text NOT NULL CHECK (btrim(texto) <> '' AND length(texto) <= 60000),
  data_postagem date,
  status text NOT NULL DEFAULT 'na_fila' CHECK (status IN ('na_fila', 'editando', 'programando', 'programado', 'erro')),
  arquivo text,
  obs text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil_id, numero)
);
CREATE INDEX esteira_dark_roteiros_perfil_idx ON public.esteira_dark_roteiros (perfil_id, data_postagem);
-- Número sequencial do roteiro dentro do perfil (V1, V2…).
CREATE OR REPLACE FUNCTION public.esteira_dark_roteiro_numero() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT coalesce(max(numero), 0) + 1 INTO NEW.numero FROM public.esteira_dark_roteiros WHERE perfil_id = NEW.perfil_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER esteira_dark_roteiro_numero BEFORE INSERT ON public.esteira_dark_roteiros FOR EACH ROW EXECUTE FUNCTION public.esteira_dark_roteiro_numero();
ALTER TABLE public.esteira_dark_roteiros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esteira_dark_roteiros FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.esteira_dark_roteiros FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.esteira_dark_roteiros FOR SELECT TO authenticated USING (public.team_row_allowed('esteira_dark_roteiros', to_jsonb(esteira_dark_roteiros.*), 'conteudo', 'acessar'));
CREATE POLICY team_grant_insert ON public.esteira_dark_roteiros FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('esteira_dark_roteiros', to_jsonb(esteira_dark_roteiros.*), 'conteudo', 'criar') AND status = 'na_fila'
              AND EXISTS (SELECT 1 FROM public.esteira_dark_perfis p WHERE p.id = perfil_id AND p.user_id = auth.uid()));
CREATE POLICY team_grant_update ON public.esteira_dark_roteiros FOR UPDATE TO authenticated USING (public.team_row_allowed('esteira_dark_roteiros', to_jsonb(esteira_dark_roteiros.*), 'conteudo', 'editar')) WITH CHECK (public.team_row_allowed('esteira_dark_roteiros', to_jsonb(esteira_dark_roteiros.*), 'conteudo', 'editar'));
CREATE POLICY team_grant_excluir ON public.esteira_dark_roteiros FOR DELETE TO authenticated USING (public.team_row_allowed('esteira_dark_roteiros', to_jsonb(esteira_dark_roteiros.*), 'conteudo', 'excluir'));
GRANT SELECT, INSERT, DELETE ON public.esteira_dark_roteiros TO authenticated;
GRANT UPDATE (titulo, texto, data_postagem, status, atualizado_em) ON public.esteira_dark_roteiros TO authenticated;   -- arquivo e obs: só o Lauro (ouvinte)
NOTIFY pgrst, 'reload schema';
