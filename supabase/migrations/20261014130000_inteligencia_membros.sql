-- Inteligência de cada funcionário da empresa (pedido do Davi, 14/10/2026):
-- "ao clicar nele, conseguisse cadastrar uma inteligência, tipo, subir pdf,
-- vídeos, para assim formar a inteligência dele".
--
-- Cada item tem um alcance (regra fixa do Davi: equipe em projeto novo chega zerada):
--   'geral'   → vai junto com o funcionário para todo projeto do mesmo dono
--               (ex.: livros de copy do Ítalo);
--   'projeto' → só vale no projeto onde foi cadastrado (voz, produto, histórico).
-- O funcionário é o mesmo em projetos diferentes pelo nome (`agente`), porque
-- cada projeto tem a sua linha em `membros`.
--
-- O texto fica em `conteudo`: PDF e texto são lidos no navegador; vídeo e
-- link ficam 'pendente' e o Mac transcreve (scripts/inteligencia/processar.py),
-- devolvendo pela RPC `inteligencia_concluir` com o token do item.

CREATE TABLE public.inteligencia_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  membro_id uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  agente text NOT NULL CHECK (btrim(agente) <> ''),
  escopo text NOT NULL DEFAULT 'projeto' CHECK (escopo IN ('geral', 'projeto')),
  tipo text NOT NULL CHECK (tipo IN ('pdf', 'texto', 'video', 'link')),
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  observacao text,
  arquivo_path text,          -- no bucket privado `inteligencia`: <cliente_id>/<membro_id>/<arquivo>
  link text,                  -- link de origem (YouTube, Drive…) ou link assinado do arquivo para o Mac baixar
  conteudo text,
  caracteres integer GENERATED ALWAYS AS (coalesce(length(conteudo), 0)) STORED,
  status text NOT NULL DEFAULT 'pronto' CHECK (status IN ('pendente', 'processando', 'pronto', 'erro')),
  mensagem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);
CREATE INDEX inteligencia_membros_agente_idx ON public.inteligencia_membros (user_id, agente, escopo);
CREATE INDEX inteligencia_membros_cliente_idx ON public.inteligencia_membros (cliente_id, agente);
CREATE INDEX inteligencia_membros_pendentes_idx ON public.inteligencia_membros (created_at) WHERE status IN ('pendente', 'processando');

-- O nome do funcionário vira a chave (`agente`), sempre do membro informado.
CREATE OR REPLACE FUNCTION public.inteligencia_liga_membro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text;
BEGIN
  IF NEW.membro_id IS NOT NULL THEN
    SELECT nome INTO v_nome FROM membros WHERE id = NEW.membro_id AND cliente_id = NEW.cliente_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'funcionário não é deste projeto'; END IF;
    NEW.agente := v_nome;
  END IF;
  NEW.agente := lower(btrim(NEW.agente));
  RETURN NEW;
END;
$$;
CREATE TRIGGER inteligencia_liga_membro BEFORE INSERT OR UPDATE OF membro_id, agente, cliente_id
  ON public.inteligencia_membros FOR EACH ROW EXECUTE FUNCTION public.inteligencia_liga_membro();

-- RLS: o mesmo da área "atividades" do projeto (como setores e membros).
ALTER TABLE public.inteligencia_membros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inteligencia_membros FROM anon, authenticated;
CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.inteligencia_membros
  FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner();
CREATE POLICY team_grant_acessar ON public.inteligencia_membros FOR SELECT TO authenticated
  USING (public.team_row_allowed('inteligencia_membros', to_jsonb(inteligencia_membros.*), 'atividades', 'acessar'));
CREATE POLICY team_grant_insert ON public.inteligencia_membros FOR INSERT TO authenticated
  WITH CHECK (public.team_row_allowed('inteligencia_membros', to_jsonb(inteligencia_membros.*), 'atividades', 'criar'));
CREATE POLICY team_grant_update ON public.inteligencia_membros FOR UPDATE TO authenticated
  USING (public.team_row_allowed('inteligencia_membros', to_jsonb(inteligencia_membros.*), 'atividades', 'editar'))
  WITH CHECK (public.team_row_allowed('inteligencia_membros', to_jsonb(inteligencia_membros.*), 'atividades', 'editar'));
CREATE POLICY team_grant_excluir ON public.inteligencia_membros FOR DELETE TO authenticated
  USING (public.team_row_allowed('inteligencia_membros', to_jsonb(inteligencia_membros.*), 'atividades', 'excluir'));
GRANT SELECT ON public.inteligencia_membros TO authenticated;
GRANT INSERT (id, cliente_id, membro_id, agente, escopo, tipo, nome, observacao, arquivo_path, link, conteudo, status, mensagem)
  ON public.inteligencia_membros TO authenticated;
GRANT UPDATE (escopo, nome, observacao, link, conteudo, status, mensagem) ON public.inteligencia_membros TO authenticated;
GRANT DELETE ON public.inteligencia_membros TO authenticated;

-- Token de cada item, só para o Mac (o app não tem acesso a esta tabela).
CREATE TABLE public.inteligencia_tokens (
  item_id uuid PRIMARY KEY REFERENCES public.inteligencia_membros(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid()
);
ALTER TABLE public.inteligencia_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inteligencia_tokens FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.inteligencia_cria_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO inteligencia_tokens (item_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER inteligencia_cria_token AFTER INSERT ON public.inteligencia_membros
  FOR EACH ROW EXECUTE FUNCTION public.inteligencia_cria_token();

-- O Mac devolve a transcrição com o token do item (só tem a chave pública).
CREATE OR REPLACE FUNCTION public.inteligencia_concluir(p_id uuid, p_token uuid, p_status text, p_conteudo text DEFAULT NULL, p_mensagem text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('processando', 'pronto', 'erro') THEN RAISE EXCEPTION 'status inválido'; END IF;
  IF p_status = 'pronto' AND coalesce(btrim(p_conteudo), '') = '' THEN RAISE EXCEPTION 'conteúdo vazio'; END IF;
  UPDATE inteligencia_membros
     SET status = p_status,
         conteudo = CASE WHEN p_status = 'pronto' THEN p_conteudo ELSE conteudo END,
         mensagem = p_mensagem,
         processado_em = CASE WHEN p_status = 'processando' THEN processado_em ELSE now() END
   WHERE id = p_id AND status IN ('pendente', 'processando')
     AND EXISTS (SELECT 1 FROM inteligencia_tokens t WHERE t.item_id = p_id AND t.token = p_token);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.inteligencia_concluir(uuid, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.inteligencia_concluir(uuid, uuid, text, text, text) TO anon, authenticated;

-- Arquivos: bucket privado (livros têm direitos autorais), pasta = projeto.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('inteligencia', 'inteligencia', false, 524288000)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.inteligencia_pasta_permitida(p_nome text, p_acao text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cliente uuid;
BEGIN
  BEGIN
    v_cliente := (storage.foldername(p_nome))[1]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  RETURN v_cliente IS NOT NULL AND public.team_allowed(v_cliente, 'atividades', p_acao);
END;
$$;

CREATE POLICY "Inteligência: equipe envia na pasta do projeto" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inteligencia' AND public.inteligencia_pasta_permitida(name, 'criar'));
CREATE POLICY "Inteligência: equipe lê a pasta do projeto" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inteligencia' AND public.inteligencia_pasta_permitida(name, 'acessar'));
CREATE POLICY "Inteligência: dono apaga da pasta do projeto" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inteligencia' AND public.inteligencia_pasta_permitida(name, 'excluir'));

NOTIFY pgrst, 'reload schema';
