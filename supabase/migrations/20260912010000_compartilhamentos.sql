-- Compartilhamento de documentos e pastas por link: quem recebe o link cria
-- uma conta (ou entra com uma já existente) e passa a enxergar só aquele
-- documento (ou, se a pasta inteira foi compartilhada, todas as guias dela)
-- — nunca o cliente inteiro. Revogar é apagar a linha em "compartilhamentos"
-- (cascade tira o acesso de quem tinha aceitado).
BEGIN;

CREATE TABLE public.compartilhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  tipo text NOT NULL CHECK (tipo IN ('documento', 'pasta')),
  documento_id uuid REFERENCES public.documentos(id) ON DELETE CASCADE,
  pasta_id uuid REFERENCES public.pastas_atividade(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'documento' AND documento_id IS NOT NULL AND pasta_id IS NULL) OR
    (tipo = 'pasta' AND pasta_id IS NOT NULL AND documento_id IS NULL)
  )
);
CREATE INDEX compartilhamentos_documento_idx ON public.compartilhamentos (documento_id);
CREATE INDEX compartilhamentos_pasta_idx ON public.compartilhamentos (pasta_id);

-- Quem aceitou qual link (por e-mail, mesmo padrão de equipe_cliente).
CREATE TABLE public.compartilhamento_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compartilhamento_id uuid NOT NULL REFERENCES public.compartilhamentos(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compartilhamento_id, email)
);

ALTER TABLE public.compartilhamentos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.compartilhamentos
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();

CREATE POLICY team_anon_read ON public.compartilhamentos AS RESTRICTIVE FOR SELECT TO anon USING (false);
CREATE POLICY team_anon_insert ON public.compartilhamentos AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY team_anon_update ON public.compartilhamentos AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY team_anon_delete ON public.compartilhamentos AS RESTRICTIVE FOR DELETE TO anon USING (false);

CREATE POLICY team_guard_acessar ON public.compartilhamentos AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.team_row_allowed('compartilhamentos', to_jsonb(compartilhamentos.*), 'documentos', 'acessar'));
CREATE POLICY team_grant_acessar ON public.compartilhamentos FOR SELECT TO authenticated
  USING (public.team_row_allowed('compartilhamentos', to_jsonb(compartilhamentos.*), 'documentos', 'acessar'));

CREATE POLICY team_guard_criar ON public.compartilhamentos AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('compartilhamentos', to_jsonb(compartilhamentos.*), 'documentos', 'criar'));
CREATE POLICY team_grant_insert ON public.compartilhamentos FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('compartilhamentos', to_jsonb(compartilhamentos.*), 'documentos', 'criar'));

CREATE POLICY team_guard_excluir ON public.compartilhamentos AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.team_row_allowed('compartilhamentos', to_jsonb(compartilhamentos.*), 'documentos', 'excluir'));
CREATE POLICY team_grant_excluir ON public.compartilhamentos FOR DELETE TO authenticated
  USING (public.team_row_allowed('compartilhamentos', to_jsonb(compartilhamentos.*), 'documentos', 'excluir'));

-- Nunca lida/gravada direto pelo cliente: só pelas funções abaixo
-- (SECURITY DEFINER, rodam como dono da função e ignoram RLS).
ALTER TABLE public.compartilhamento_acessos ENABLE ROW LEVEL SECURITY;

-- A linha (jsonb) de "documentos" tem acesso liberado se existir algum
-- compartilhamento aceito pra ela, direto ou pela pasta.
CREATE FUNCTION public.documento_compartilhado_comigo(row_data jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.compartilhamento_acessos ca
    JOIN public.compartilhamentos c ON c.id = ca.compartilhamento_id
    JOIN auth.users u ON u.id = auth.uid()
    WHERE lower(u.email) = ca.email
      AND (
        c.documento_id = (row_data->>'id')::uuid
        OR (c.pasta_id IS NOT NULL AND row_data->>'pasta_id' IS NOT NULL AND c.pasta_id = (row_data->>'pasta_id')::uuid)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.documento_compartilhado_comigo(jsonb) FROM PUBLIC;

-- Mesma função de 20260911010000 (proprietário visível direto na linha,
-- pro RETURNING de INSERT em "clientes"), só somando por cima o caminho de
-- compartilhamento pra "documentos" (acessar/editar).
CREATE OR REPLACE FUNCTION public.team_row_allowed(table_name text, row_data jsonb, area text, action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid;
BEGIN
  IF table_name = 'documentos' AND action IN ('acessar', 'editar')
     AND public.documento_compartilhado_comigo(row_data) THEN
    RETURN true;
  END IF;
  target := public.team_row_client(table_name, row_data);
  IF target IS NULL THEN RETURN (row_data->>'user_id')::uuid = auth.uid(); END IF;
  IF table_name = 'clientes' AND (action = 'criar' OR (row_data->>'user_id')::uuid = auth.uid()) THEN
    RETURN (row_data->>'user_id')::uuid = auth.uid();
  END IF;
  IF table_name = 'equipe_cliente' THEN
    RETURN EXISTS (SELECT 1 FROM public.clientes WHERE id = target AND user_id = auth.uid());
  END IF;
  RETURN public.team_allowed(target, area, action);
END;
$$;

-- Metadados públicos de um link (tipo + título) — dá pra mostrar "você foi
-- convidado para X" antes mesmo de logar, sem expor o conteúdo.
CREATE FUNCTION public.compartilhamento_publico(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE registro record; titulo text;
BEGIN
  SELECT * INTO registro FROM public.compartilhamentos WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('valido', false); END IF;
  IF registro.tipo = 'documento' THEN
    SELECT d.titulo INTO titulo FROM public.documentos d WHERE d.id = registro.documento_id;
  ELSE
    SELECT p.nome INTO titulo FROM public.pastas_atividade p WHERE p.id = registro.pasta_id;
  END IF;
  RETURN jsonb_build_object(
    'valido', true,
    'tipo', registro.tipo,
    'titulo', coalesce(titulo, 'Sem título'),
    'documento_id', registro.documento_id,
    'pasta_id', registro.pasta_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.compartilhamento_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compartilhamento_publico(text) TO anon, authenticated;

-- Chamada só depois de logar/criar conta: registra o e-mail como tendo
-- aceitado o link. Dali em diante o RLS normal de "documentos" já libera.
CREATE FUNCTION public.aceitar_compartilhamento(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE registro record; meu_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É preciso estar autenticado para aceitar um compartilhamento';
  END IF;
  SELECT * INTO registro FROM public.compartilhamentos WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link de compartilhamento inválido';
  END IF;
  SELECT lower(email) INTO meu_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.compartilhamento_acessos (compartilhamento_id, email)
  VALUES (registro.id, meu_email)
  ON CONFLICT (compartilhamento_id, email) DO NOTHING;
  RETURN jsonb_build_object('tipo', registro.tipo, 'documento_id', registro.documento_id, 'pasta_id', registro.pasta_id);
END;
$$;
REVOKE ALL ON FUNCTION public.aceitar_compartilhamento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aceitar_compartilhamento(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
