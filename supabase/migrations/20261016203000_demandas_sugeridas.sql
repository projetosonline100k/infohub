-- Guia "Passar demanda" no kanban do Pedro (pedido do Davi, 16/10/2026: "preciso
-- que você tbm fique responsavel por caçar o que passar para o pessoal … para
-- agente nao ter pessoa ociosa, afinal, tempo é dinheiro"). Nas rodadas de 30 min
-- o Pedro olha quem está sem tarefa (ou com pouca) e sugere um cartão por pessoa
-- (scripts/pedro/demandas.py). O Davi passa, deixa para depois ou descarta.
-- "Passar" abre a conversa de briefing com o funcionário (a tarefa só nasce
-- quando o Davi confirma lá): o Pedro nunca passa tarefa sozinho.
CREATE TABLE public.demandas_sugeridas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  membro_id uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (btrim(titulo) <> ''),   -- o que passar
  porque text,                                        -- meta, produto, gargalo
  produto text,
  precisa text,                                       -- o que a pessoa vai precisar do Davi
  prazo_sugerido date,
  status text NOT NULL DEFAULT 'ideia' CHECK (status IN ('ideia', 'passada', 'adiada', 'descartada')),
  briefing_id uuid REFERENCES public.briefings(id) ON DELETE SET NULL,
  visto_em timestamptz,                               -- vazio = selo NOVO
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demandas_sugeridas_cliente_idx ON public.demandas_sugeridas (cliente_id, status, criado_em);

CREATE OR REPLACE FUNCTION public.demanda_atualiza()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Só abrir o cartão (visto_em) não conta como mudança.
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) - 'visto_em' - 'atualizado_em' = to_jsonb(OLD) - 'visto_em' - 'atualizado_em' THEN
    RETURN NEW;
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER demanda_atualiza BEFORE INSERT OR UPDATE ON public.demandas_sugeridas FOR EACH ROW EXECUTE FUNCTION public.demanda_atualiza();

ALTER TABLE public.demandas_sugeridas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demandas_sugeridas FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.demandas_sugeridas FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.demandas_sugeridas FOR SELECT TO authenticated
  USING (public.team_row_allowed('demandas_sugeridas', to_jsonb(demandas_sugeridas.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_update ON public.demandas_sugeridas FOR UPDATE TO authenticated
  USING (public.team_row_allowed('demandas_sugeridas', to_jsonb(demandas_sugeridas.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('demandas_sugeridas', to_jsonb(demandas_sugeridas.*), 'atividades', 'editar'));
CREATE POLICY team_grant_excluir ON public.demandas_sugeridas FOR DELETE TO authenticated
  USING (public.team_row_allowed('demandas_sugeridas', to_jsonb(demandas_sugeridas.*), 'atividades', 'excluir'));
-- Quem escreve as sugestões é o Pedro (conexão de admin); o app só decide.
GRANT SELECT, DELETE ON public.demandas_sugeridas TO authenticated;
GRANT UPDATE (status, briefing_id, visto_em) ON public.demandas_sugeridas TO authenticated;

NOTIFY pgrst, 'reload schema';
