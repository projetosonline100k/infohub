-- Modo Creator: links mandados do iPhone pro Jarvis por um Atalho (Shortcuts)
-- no menu Compartilhar. O Atalho chama receber_link_atalho(token, url) pela
-- API REST com a chave pública (anon); a função confere o token secreto do
-- dono e põe o link na fila. O Jarvis no Mac transcreve a fila sozinho.
--   status: nova → transcrevendo → transcrita | erro

CREATE TABLE IF NOT EXISTS public.creator_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link text NOT NULL,
  origem text NOT NULL DEFAULT 'iphone',
  status text NOT NULL DEFAULT 'nova' CHECK (status IN ('nova', 'transcrevendo', 'transcrita', 'erro')),
  erro text,
  transcricao_id uuid REFERENCES public.creator_transcricoes(id) ON DELETE SET NULL,
  criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_links_user_criada_idx ON public.creator_links (user_id, criada_em DESC);

ALTER TABLE public.creator_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.creator_links FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.creator_links FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_delete" ON public.creator_links FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.creator_links FROM anon, authenticated;
GRANT SELECT, DELETE, UPDATE (status, erro, transcricao_id) ON public.creator_links TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_links;

-- Token do Atalho: só o hash fica guardado (o token aparece uma vez, no app).
CREATE TABLE IF NOT EXISTS public.creator_atalho_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_atalho_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_atalho_tokens FROM anon, authenticated;

-- App (logado): gera um token novo (o anterior para de funcionar) e devolve
-- o texto dele uma única vez.
CREATE OR REPLACE FUNCTION public.gerar_token_atalho()
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
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.creator_atalho_tokens(user_id, token_hash, criado_em)
  VALUES (auth.uid(), encode(extensions.digest(v_token, 'sha256'), 'hex'), now())
  ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, criado_em = now();
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.gerar_token_atalho() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_token_atalho() TO authenticated;

-- App (logado): o Atalho já foi configurado?
CREATE OR REPLACE FUNCTION public.atalho_configurado()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT criado_em FROM public.creator_atalho_tokens WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.atalho_configurado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atalho_configurado() TO authenticated;

-- iPhone (anônimo, com o token): entrega um link. Só isso — não lê nada.
CREATE OR REPLACE FUNCTION public.receber_link_atalho(p_token text, p_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid;
  v_url text := btrim(coalesce(p_url, ''));
BEGIN
  SELECT user_id INTO v_user FROM public.creator_atalho_tokens
   WHERE token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'token inválido' USING ERRCODE = '42501';
  END IF;
  -- O Instagram às vezes manda texto + link: fica só com o primeiro link.
  v_url := substring(v_url FROM 'https?://[^[:space:]]+');
  IF v_url IS NULL OR length(v_url) > 1000 THEN
    RAISE EXCEPTION 'link inválido' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.creator_links WHERE user_id = v_user AND criada_em > now() - interval '1 day') >= 300 THEN
    RAISE EXCEPTION 'limite diário de links atingido' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.creator_links(user_id, link) VALUES (v_user, v_url);
  RETURN 'Enviado pro Jarvis';
END;
$$;
REVOKE ALL ON FUNCTION public.receber_link_atalho(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_link_atalho(text, text) TO anon, authenticated;
