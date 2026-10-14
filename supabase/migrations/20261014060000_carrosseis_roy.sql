-- Carrosséis do Roy (IA de carrosséis, docs/agentes/roy-carrossel.md).
-- O Roy cria no Mac do Davi (scripts/roy/) e grava aqui o andamento; o
-- Infopro mostra em "Precisa de você" para o Davi aprovar ou pedir ajuste.
-- Aprovado, vira tarefa da Dalila programar (a publicação é a Fase 2).

-- Estilos cadastráveis: o primeiro é o "Clássico marfim". `parametros` é o
-- template que o gerador lê (cores, fontes, posições, ilustração e prompt).
CREATE TABLE public.estilos_carrossel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL,
  descricao text,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  exemplos text[] NOT NULL DEFAULT '{}',   -- URLs de páginas de exemplo
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, nome)
);

CREATE TABLE public.carrosseis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  estilo_id uuid REFERENCES public.estilos_carrossel(id) ON DELETE SET NULL,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL, -- tarefa da Dalila, depois de aprovado
  numero integer,                 -- NNN da pasta no Drive
  tema text NOT NULL,
  fonte_id text NOT NULL,         -- id do reel de origem
  fonte_permalink text,
  fonte_data timestamptz,
  fonte_legenda text,
  status text NOT NULL DEFAULT 'produzindo'
    CHECK (status IN ('produzindo', 'revisar', 'ajuste', 'aprovado', 'programado', 'publicado', 'erro')),
  mensagem text,                  -- o que está acontecendo / motivo do erro
  feedback text,                  -- pedido de ajuste do Davi
  slides jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{"titulo", "texto", "pagina"}]
  legenda text,
  paginas text[] NOT NULL DEFAULT '{}',       -- URLs das PNGs da versão atual, em ordem
  pasta_drive text,
  versao integer NOT NULL DEFAULT 1,
  revisado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, fonte_id)   -- a mesma fonte nunca vira dois carrosséis
);
CREATE INDEX carrosseis_cliente_idx ON public.carrosseis (cliente_id, status);

ALTER TABLE public.estilos_carrossel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrosseis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estilos_carrossel, public.carrosseis FROM anon, authenticated;

CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.estilos_carrossel
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.carrosseis
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();

CREATE POLICY team_grant_acessar ON public.estilos_carrossel FOR SELECT TO authenticated
  USING (public.team_row_allowed('estilos_carrossel', to_jsonb(estilos_carrossel.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_acessar ON public.carrosseis FOR SELECT TO authenticated
  USING (public.team_row_allowed('carrosseis', to_jsonb(carrosseis.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_update ON public.carrosseis FOR UPDATE TO authenticated
  USING (public.team_row_allowed('carrosseis', to_jsonb(carrosseis.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('carrosseis', to_jsonb(carrosseis.*), 'atividades', 'editar'));

-- Quem cria e renderiza é o Roy (conexão de admin); o app lê, aprova, pede
-- ajuste e corrige texto. Páginas, fonte e pasta são só do Roy.
GRANT SELECT ON public.estilos_carrossel TO authenticated;
GRANT SELECT, UPDATE (status, feedback, slides, legenda, revisado_em, atividade_id, atualizado_em)
  ON public.carrosseis TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.carrosseis;

-- Páginas renderizadas: <cliente_id>/<carrossel_id>/v<versao>/NN.png.
-- Leitura pública (a Meta vai precisar buscar por URL na Fase 2; o caminho
-- tem o id do carrossel, que não é adivinhável). Só o Roy (chave de
-- servidor) envia, então não há policy de escrita.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('carrosseis', 'carrosseis', true, 8388608, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Páginas de carrossel são públicas para leitura"
  ON storage.objects FOR SELECT USING (bucket_id = 'carrosseis');

NOTIFY pgrst, 'reload schema';
