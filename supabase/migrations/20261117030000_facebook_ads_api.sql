-- Facebook Ads pela API oficial da Meta (17/11/2026, Davi: dash do Kdu "igual o da UTMify": ver, ativar/pausar, criar campanha e subir criativo por aqui).
-- Conexão por OAuth (Login do Facebook) → token de 60 dias guardado só no servidor; o app lê os números sincronizados e pede ações à edge function `facebook-ads`.
-- Toda ação que gasta dinheiro passa pela função (teto diário por conta, tudo nasce PAUSADO) e fica registrada em ads_acoes.

CREATE TABLE public.facebook_conexoes (                  -- sem acesso pelo app (token)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fb_user_id text NOT NULL,
  nome text,
  access_token text NOT NULL,
  token_expira_em timestamptz,
  escopos text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_user_id)
);
CREATE TABLE public.facebook_oauth_states (               -- sem acesso pelo app
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz
);
ALTER TABLE public.facebook_conexoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.facebook_conexoes, public.facebook_oauth_states FROM anon, authenticated;

-- Contas de anúncios (de todas as empresas/BMs a que o usuário do Facebook tem acesso).
CREATE TABLE public.ads_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conexao_id uuid REFERENCES public.facebook_conexoes(id) ON DELETE CASCADE,
  conta_ref text NOT NULL,                  -- act_123…
  nome text,
  moeda text,
  status text,
  empresa text,                             -- nome do Business Manager dono
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,   -- projeto a que a conta pertence (o Kdu de cada escritório abre a dele)
  limite_diario numeric,                    -- teto de verba diária somada das campanhas ATIVAS (a função recusa passar disso). NULL = sem teto (não liga nada sem definir).
  sincronizada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conta_ref)
);
CREATE TABLE public.ads_conjuntos (
  user_id uuid NOT NULL, conta_ref text NOT NULL, conjunto_ref text NOT NULL, campanha_ref text NOT NULL,
  nome text NOT NULL, status text, status_efetivo text, orcamento_diario numeric, otimizacao text, atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_ref, conjunto_ref)
);
CREATE TABLE public.ads_anuncios (
  user_id uuid NOT NULL, conta_ref text NOT NULL, anuncio_ref text NOT NULL, conjunto_ref text NOT NULL, campanha_ref text NOT NULL,
  nome text NOT NULL, status text, status_efetivo text, miniatura text, atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_ref, anuncio_ref)
);
-- Números por dia em qualquer nível (campanha, conjunto ou anúncio).
CREATE TABLE public.ads_insights_diarios (
  user_id uuid NOT NULL, conta_ref text NOT NULL,
  nivel text NOT NULL CHECK (nivel IN ('campanha', 'conjunto', 'anuncio')),
  ref text NOT NULL, dia date NOT NULL,
  gasto numeric NOT NULL DEFAULT 0, impressoes bigint NOT NULL DEFAULT 0, alcance bigint, cliques bigint NOT NULL DEFAULT 0,
  resultados numeric NOT NULL DEFAULT 0, tipo_resultado text, valor_conversao numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (conta_ref, nivel, ref, dia)
);
CREATE INDEX ads_insights_dia_idx ON public.ads_insights_diarios (conta_ref, nivel, dia DESC);
-- Campanhas do modo API ficam em ads_campanhas (mesma tabela do Chrome), com a conta e o orçamento.
ALTER TABLE public.ads_campanhas ADD COLUMN IF NOT EXISTS status_efetivo text, ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'chrome';
-- Criativos (imagens e vídeos subidos pelo dash) e o histórico de tudo que o Kdu/Davi fez na conta.
CREATE TABLE public.ads_criativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, conta_ref text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('imagem', 'video')),
  nome text NOT NULL, arquivo_url text NOT NULL, miniatura text,
  fb_imagem_hash text, fb_video_id text,
  pasta text, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ads_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, conta_ref text,
  acao text NOT NULL, alvo text, detalhe jsonb,
  ok boolean NOT NULL DEFAULT true, erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ads_acoes_idx ON public.ads_acoes (user_id, criado_em DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ads_contas', 'ads_conjuntos', 'ads_anuncios', 'ads_insights_diarios', 'ads_criativos', 'ads_acoes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE POLICY dono_le ON public.%I FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;
-- O app só escolhe o projeto e o teto da conta; todo o resto vem da função.
CREATE POLICY dono_edita ON public.ads_contas FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
GRANT UPDATE (cliente_id, limite_diario) ON public.ads_contas TO authenticated;
-- Pastas dos criativos (organizar): o app renomeia a pasta e apaga o registro (o arquivo da Meta fica na conta).
CREATE POLICY dono_edita ON public.ads_criativos FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
GRANT UPDATE (pasta, nome) ON public.ads_criativos TO authenticated;
CREATE POLICY dono_apaga ON public.ads_criativos FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT DELETE ON public.ads_criativos TO authenticated;

-- Arquivos dos criativos: bucket público (a Meta baixa o vídeo pelo link), caminho <user_id>/…
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('ads-criativos', 'ads-criativos', true, 524288000) ON CONFLICT (id) DO NOTHING;
CREATE POLICY ads_criativos_sobe ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ads-criativos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY ads_criativos_apaga ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ads-criativos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
NOTIFY pgrst, 'reload schema';
