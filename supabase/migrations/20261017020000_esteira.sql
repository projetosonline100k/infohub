-- Esteira de produção por escritório (pedido do Davi, 17/10/2026): "esses 3 vão
-- trabalhar em conjunto, quero que eles tenham um kanban juntos: o Leo cria as
-- headlines, passa para o Junior, que escreve os roteiros, que passa para o Elias
-- revisar; e nesse kanban tenha o chat".
-- setores.esteira: as etapas, em ordem: [{"nome": "Headlines", "membro_id": "..."}, ...].
-- esteira_itens: cada peça. etapa = índice da etapa atual (= número de etapas: pronto
-- para o Davi). situacao da etapa atual: fila (esperando o funcionário), fazendo,
-- feito (só no fim), descartado. O ouvinte cria a tarefa de quem é a vez
-- (scripts/empresa/esteira.py) e a peça anda sozinha.
ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS esteira jsonb;
GRANT UPDATE (esteira) ON public.setores TO authenticated;

CREATE TABLE public.esteira_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  setor_id uuid NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  user_id uuid,
  titulo text NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 500),
  textos jsonb NOT NULL DEFAULT '{}'::jsonb,
  etapa smallint NOT NULL DEFAULT 0 CHECK (etapa >= 0),
  situacao text NOT NULL DEFAULT 'fila' CHECK (situacao IN ('fila', 'fazendo', 'feito', 'descartado')),
  nota text,
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX esteira_itens_setor ON public.esteira_itens (setor_id, etapa, situacao);

CREATE OR REPLACE FUNCTION public.esteira_atualiza()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.atualizado_em := now();
  -- A peça é do mesmo projeto do escritório.
  IF NOT EXISTS (SELECT 1 FROM setores s WHERE s.id = NEW.setor_id AND s.cliente_id = NEW.cliente_id) THEN
    RAISE EXCEPTION 'Escritório de outro projeto';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER esteira_atualiza BEFORE INSERT OR UPDATE ON public.esteira_itens FOR EACH ROW EXECUTE FUNCTION public.esteira_atualiza();

ALTER TABLE public.esteira_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esteira_itens FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.esteira_itens FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.esteira_itens FOR SELECT TO authenticated
  USING (public.team_row_allowed('esteira_itens', to_jsonb(esteira_itens.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_insert ON public.esteira_itens FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('esteira_itens', to_jsonb(esteira_itens.*), 'atividades', 'criar'));
CREATE POLICY team_grant_update ON public.esteira_itens FOR UPDATE TO authenticated
  USING (public.team_row_allowed('esteira_itens', to_jsonb(esteira_itens.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('esteira_itens', to_jsonb(esteira_itens.*), 'atividades', 'editar'));
CREATE POLICY team_grant_excluir ON public.esteira_itens FOR DELETE TO authenticated
  USING (public.team_row_allowed('esteira_itens', to_jsonb(esteira_itens.*), 'atividades', 'excluir'));
GRANT SELECT, DELETE ON public.esteira_itens TO authenticated;
-- O Davi escreve uma ideia (etapa 0) e move/descarta; quem trabalha é o ouvinte (admin).
GRANT INSERT (id, cliente_id, setor_id, titulo, etapa, nota, ordem) ON public.esteira_itens TO authenticated;
GRANT UPDATE (titulo, etapa, situacao, nota, ordem, atividade_id) ON public.esteira_itens TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.esteira_itens;

-- Laboratório De Viral (projeto Davi Queiroz): Leo → Junior → Elias.
UPDATE public.setores SET esteira = jsonb_build_array(
  jsonb_build_object('nome', 'Headlines', 'membro_id', 'a79b9c98-5067-4a16-b7f3-70b994bcf943'),
  jsonb_build_object('nome', 'Roteiro', 'membro_id', '24baa83a-7246-420d-ba45-9c3f89fce5d0'),
  jsonb_build_object('nome', 'Revisão', 'membro_id', '56c5189e-a774-4767-85ad-628ce347434c'))
 WHERE id = '01c9b4db-34ed-4a49-938c-d495e349d03b';

NOTIFY pgrst, 'reload schema';
