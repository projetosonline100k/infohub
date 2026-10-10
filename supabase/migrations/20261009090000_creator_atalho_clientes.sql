-- Atalho do iPhone para CLIENTES (ex.: o Matheus): o Davi gera uma chave
-- ligada a um projeto; o cliente monta o Atalho "Jarvis" no iPhone dele com
-- essa chave. Cada reel compartilhado cai na fila do Jarvis do Davi
-- (creator_links, com cliente_id = destino), que transcreve no Mac e cria a
-- ideia direto nas "Ideias em destaque" do projeto (videos_referencia +
-- videos_vertical status 'ideia') — ver processarFila no app.

ALTER TABLE public.creator_links ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.creator_atalho_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cliente_id)
);
ALTER TABLE public.creator_atalho_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.creator_atalho_clientes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.creator_atalho_clientes FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.creator_atalho_clientes FROM anon, authenticated;
-- O hash nunca sai do banco: o app só vê pra qual projeto existe atalho.
GRANT SELECT (id, user_id, cliente_id, criado_em), DELETE ON public.creator_atalho_clientes TO authenticated;

-- App (dono do projeto): gera a chave do atalho daquele cliente (uma nova
-- invalida a anterior) e devolve o texto dela uma única vez.
CREATE OR REPLACE FUNCTION public.gerar_token_atalho_cliente(p_cliente uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'login necessário' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'só o dono do projeto gera o atalho' USING ERRCODE = '42501';
  END IF;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.creator_atalho_clientes(user_id, cliente_id, token_hash)
  VALUES (auth.uid(), p_cliente, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  ON CONFLICT (user_id, cliente_id) DO UPDATE SET token_hash = excluded.token_hash, criado_em = now();
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.gerar_token_atalho_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_token_atalho_cliente(uuid) TO authenticated;

-- iPhone: aceita a chave do Davi (fila dele / modo "Separar ideias") ou a
-- chave de um cliente (vai pras Ideias em destaque daquele projeto).
CREATE OR REPLACE FUNCTION public.receber_link_atalho(p_token text, p_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_user uuid;
  v_cliente uuid;
  v_pasta uuid;
  v_url text := btrim(coalesce(p_url, ''));
BEGIN
  SELECT user_id INTO v_user FROM public.creator_atalho_tokens WHERE token_hash = v_hash;
  IF v_user IS NULL THEN
    SELECT user_id, cliente_id INTO v_user, v_cliente FROM public.creator_atalho_clientes WHERE token_hash = v_hash;
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'token inválido' USING ERRCODE = '42501';
  END IF;
  v_url := substring(v_url FROM 'https?://[^[:space:]]+');
  IF v_url IS NULL OR length(v_url) > 1000 THEN
    RAISE EXCEPTION 'link inválido' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.creator_links WHERE user_id = v_user AND criada_em > now() - interval '1 day') >= 300 THEN
    RAISE EXCEPTION 'limite diário de links atingido' USING ERRCODE = '54000';
  END IF;
  IF v_cliente IS NULL THEN
    SELECT pasta_id INTO v_pasta FROM public.creator_modo WHERE user_id = v_user;
  END IF;
  INSERT INTO public.creator_links(user_id, link, pasta_id, cliente_id, origem)
  VALUES (v_user, v_url, v_pasta, v_cliente, CASE WHEN v_cliente IS NULL THEN 'iphone' ELSE 'iphone-cliente' END);
  RETURN CASE
    WHEN v_cliente IS NOT NULL THEN 'Enviado pras Ideias em destaque'
    WHEN v_pasta IS NOT NULL THEN 'Enviado pro Jarvis (separar ideias)'
    ELSE 'Enviado pro Jarvis' END;
END;
$$;
REVOKE ALL ON FUNCTION public.receber_link_atalho(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_link_atalho(text, text) TO anon, authenticated;
