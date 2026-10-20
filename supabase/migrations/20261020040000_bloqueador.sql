-- Bloqueador (20/10, pedido do Davi): com ele ligado, o app do Mac esconde os apps da lista e
-- troca os sites da lista por uma página de "bloqueado". Liga na mão ou sozinho enquanto o
-- cronômetro de uma atividade está rodando (no_foco). Desligar antes da hora pede o motivo.
CREATE TABLE IF NOT EXISTS public.bloqueador_config (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  apps jsonb NOT NULL DEFAULT '[]'::jsonb,      -- ["WhatsApp", "com.apple.MobileSMS", …] (nome ou bundle id)
  sites jsonb NOT NULL DEFAULT '[]'::jsonb,     -- ["instagram.com", "youtube.com", …]
  no_foco boolean NOT NULL DEFAULT true,        -- liga sozinho com o cronômetro de uma atividade
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bloqueador_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'foco')),
  atividade_id uuid REFERENCES public.atividades(id) ON DELETE SET NULL,
  inicio timestamptz NOT NULL DEFAULT now(),
  fim_previsto timestamptz,                     -- null = até o cronômetro parar (origem foco)
  encerrado_em timestamptz,
  motivo_saida text,                            -- obrigatório quando desligou antes de fim_previsto
  bloqueios int NOT NULL DEFAULT 0,             -- quantas vezes barrou algo
  CONSTRAINT bloqueador_motivo_antes_da_hora CHECK (
    encerrado_em IS NULL OR fim_previsto IS NULL OR encerrado_em >= fim_previsto
    OR length(btrim(coalesce(motivo_saida, ''))) >= 5)
);
CREATE INDEX IF NOT EXISTS bloqueador_sessoes_abertas_idx ON public.bloqueador_sessoes (user_id) WHERE encerrado_em IS NULL;

ALTER TABLE public.bloqueador_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueador_sessoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bloqueador_config_dono ON public.bloqueador_config;
CREATE POLICY bloqueador_config_dono ON public.bloqueador_config FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS bloqueador_sessoes_dono ON public.bloqueador_sessoes;
CREATE POLICY bloqueador_sessoes_dono ON public.bloqueador_sessoes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bloqueador_config, public.bloqueador_sessoes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
