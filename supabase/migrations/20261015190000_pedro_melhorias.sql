-- Pedro = IA de melhorias do Infopro (pedido do Davi, 15/10/2026): ele levanta
-- o que melhorar no sistema e mostra num kanban (Ideias → Pode fazer → Fazendo →
-- Feito) dentro da janela dele. O que o Davi arrasta para "Pode fazer" o Pedro
-- implementa sozinho ("pode dar essa liberdade para ele"), num worktree do git,
-- testa e junta no main (scripts/pedro/melhorias.py + ouvinte, linha "melhorias").

-- O Pedro do projeto Davi Queiroz vira IA (nos outros projetos segue pessoa).
UPDATE public.membros SET eh_ia = true, funcao = 'Melhorias do Infopro e métricas (IA)'
 WHERE id = 'ba30e50e-cb48-4547-8b9a-475376c7a017';

CREATE TABLE public.melhorias_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  titulo text NOT NULL CHECK (btrim(titulo) <> ''),
  problema text,
  porque text,
  sugestao text,
  impacto smallint CHECK (impacto BETWEEN 1 AND 3),
  esforco smallint CHECK (esforco BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'ideia' CHECK (status IN ('ideia', 'pode_fazer', 'fazendo', 'feito', 'descartada', 'erro')),
  origem text NOT NULL DEFAULT 'pedro' CHECK (origem IN ('pedro', 'davi')),
  ordem integer NOT NULL DEFAULT 0,
  agora text,            -- o que o Pedro está fazendo nela (enquanto "fazendo")
  progresso smallint CHECK (progresso BETWEEN 0 AND 100),
  resultado text,        -- o que foi feito (ou o motivo do erro)
  commit_sha text,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX melhorias_sistema_cliente_idx ON public.melhorias_sistema (cliente_id, status, ordem);

CREATE OR REPLACE FUNCTION public.melhoria_atualiza()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.atualizado_em := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'fazendo' THEN NEW.iniciado_em := now(); END IF;
    IF NEW.status IN ('feito', 'erro') THEN NEW.concluido_em := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER melhoria_atualiza BEFORE INSERT OR UPDATE ON public.melhorias_sistema FOR EACH ROW EXECUTE FUNCTION public.melhoria_atualiza();

ALTER TABLE public.melhorias_sistema ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.melhorias_sistema FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.melhorias_sistema FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.melhorias_sistema FOR SELECT TO authenticated
  USING (public.team_row_allowed('melhorias_sistema', to_jsonb(melhorias_sistema.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_insert ON public.melhorias_sistema FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('melhorias_sistema', to_jsonb(melhorias_sistema.*), 'atividades', 'criar'));
CREATE POLICY team_grant_update ON public.melhorias_sistema FOR UPDATE TO authenticated
  USING (public.team_row_allowed('melhorias_sistema', to_jsonb(melhorias_sistema.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('melhorias_sistema', to_jsonb(melhorias_sistema.*), 'atividades', 'editar'));
CREATE POLICY team_grant_excluir ON public.melhorias_sistema FOR DELETE TO authenticated
  USING (public.team_row_allowed('melhorias_sistema', to_jsonb(melhorias_sistema.*), 'atividades', 'excluir'));
GRANT SELECT, DELETE ON public.melhorias_sistema TO authenticated;
-- O Davi escreve uma ideia e move os cartões; o resto é do Pedro (pela conexão de admin).
GRANT INSERT (id, cliente_id, titulo, problema, sugestao, origem, ordem) ON public.melhorias_sistema TO authenticated;
GRANT UPDATE (status, ordem, titulo, problema, sugestao) ON public.melhorias_sistema TO authenticated;

-- O app só move entre Ideias / Pode fazer / Descartada (Fazendo, Feito e Erro são do Pedro).
CREATE OR REPLACE FUNCTION public.melhoria_confere_app()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND (NEW.status <> 'ideia' OR NEW.origem <> 'davi') THEN
      RAISE EXCEPTION 'pelo app a ideia entra como ideia do Davi';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND (NEW.status NOT IN ('ideia', 'pode_fazer', 'descartada') OR OLD.status = 'fazendo') THEN
      RAISE EXCEPTION 'esse passo é do Pedro';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER melhoria_confere_app BEFORE INSERT OR UPDATE ON public.melhorias_sistema FOR EACH ROW EXECUTE FUNCTION public.melhoria_confere_app();

NOTIFY pgrst, 'reload schema';
