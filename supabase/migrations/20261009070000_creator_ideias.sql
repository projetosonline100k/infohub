-- Modo Creator → "Separar ideias": o Davi escolhe um mentorado (uma pasta do
-- Docs) e liga o modo; todo link mandado do iPhone nesse modo vira uma ideia
-- numerada (1, 2, 3… por mentorado) com a headline do vídeo e a tradução. A
-- sessão "Inteligência do Infopro" (comando /ideia <id> na Conversa) extrai
-- e traduz e acrescenta a ideia no documento "Ideias de headline — <nome>"
-- dentro da pasta (scripts/creator-ideia.py).

-- Modo ligado = qual mentorado (pasta) recebe os links. NULL = desligado.
CREATE TABLE IF NOT EXISTS public.creator_modo (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pasta_id uuid REFERENCES public.pastas_atividade(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_modo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.creator_modo FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.creator_modo FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "account_owner_update" ON public.creator_modo FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.creator_modo FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.creator_modo TO authenticated;

-- O link guarda o mentorado do momento em que chegou.
ALTER TABLE public.creator_links ADD COLUMN IF NOT EXISTS pasta_id uuid REFERENCES public.pastas_atividade(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.creator_ideias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pasta_id uuid NOT NULL REFERENCES public.pastas_atividade(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  link text NOT NULL,
  transcricao_id uuid REFERENCES public.creator_transcricoes(id) ON DELETE SET NULL,
  idioma text,
  headline_original text,
  headline_pt text,
  traducao_pt text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pronta', 'erro')),
  erro text,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  criada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pasta_id, numero)
);
CREATE INDEX IF NOT EXISTS creator_ideias_pasta_numero_idx ON public.creator_ideias (pasta_id, numero DESC);

-- Numeração contínua por mentorado (1, 2, 3…), mesmo apagando alguma.
CREATE OR REPLACE FUNCTION public.creator_ideias_numerar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.pasta_id::text));
  SELECT coalesce(max(numero), 0) + 1 INTO NEW.numero FROM public.creator_ideias WHERE pasta_id = NEW.pasta_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS creator_ideias_numerar ON public.creator_ideias;
CREATE TRIGGER creator_ideias_numerar BEFORE INSERT ON public.creator_ideias
  FOR EACH ROW EXECUTE FUNCTION public.creator_ideias_numerar();

ALTER TABLE public.creator_ideias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.creator_ideias FOR SELECT TO authenticated USING (user_id = auth.uid());
-- O app cria a ideia (pendente) quando a transcrição fica pronta; quem
-- preenche headline/tradução é o script do Claude.
CREATE POLICY "account_owner_insert" ON public.creator_ideias FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pendente' AND headline_pt IS NULL);
CREATE POLICY "account_owner_delete" ON public.creator_ideias FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.creator_ideias FROM anon, authenticated;
GRANT SELECT, DELETE, INSERT (pasta_id, link, transcricao_id, idioma) ON public.creator_ideias TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_ideias;

-- O Atalho do iPhone agora também carimba o mentorado do modo ligado.
CREATE OR REPLACE FUNCTION public.receber_link_atalho(p_token text, p_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid;
  v_url text := btrim(coalesce(p_url, ''));
  v_pasta uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.creator_atalho_tokens
   WHERE token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
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
  SELECT pasta_id INTO v_pasta FROM public.creator_modo WHERE user_id = v_user;
  INSERT INTO public.creator_links(user_id, link, pasta_id) VALUES (v_user, v_url, v_pasta);
  RETURN CASE WHEN v_pasta IS NULL THEN 'Enviado pro Jarvis' ELSE 'Enviado pro Jarvis (separar ideias)' END;
END;
$$;
REVOKE ALL ON FUNCTION public.receber_link_atalho(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_link_atalho(text, text) TO anon, authenticated;
